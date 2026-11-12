import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchPortalEquipmentByLabCode, type PortalEquipment } from '@/lib/server/equipment-sync'
import { canLinkPortalEquipmentStatus, normalizePortalEquipmentStatus } from '@/lib/equipment/portal-reference-status'

import type { PortalEquipmentModule, PortalEquipmentReference } from '@/lib/equipment/portal-reference-types'

type Row = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
export function toPortalEquipmentReference(row: Row): PortalEquipmentReference {
  return {
    id: text(row.portal_equipment_id),
    code: text(row.lab_code),
    name: text(row.name),
    model: row.model == null ? null : text(row.model),
    serialNumber: row.serial_number == null ? null : text(row.serial_number),
    status: normalizePortalEquipmentStatus(row.status),
    portalUrl: row.portal_url == null ? null : text(row.portal_url),
  }
}

function portalReferenceRow(portal: PortalEquipment, code: string) {
  return {
    portal_equipment_id: portal.portal_equipment_id,
    lab_code: code,
    name: portal.equipment_type.trim(),
    model: portal.model || null,
    serial_number: portal.serial_number || null,
    status: normalizePortalEquipmentStatus(portal.portal_status),
    portal_url: portal.portal_url || null,
    synced_at: new Date().toISOString(),
  }
}

async function upsertPortalReference(row: ReturnType<typeof portalReferenceRow>) {
  const admin = getAdminClient()
  const { data: existing, error: lookupError } = await admin.from('bm_portal_equipment_refs')
    .select('portal_equipment_id').eq('lab_code', row.lab_code).maybeSingle()
  if (lookupError) throw new HttpError(500, lookupError.message)
  if (existing && existing.portal_equipment_id !== row.portal_equipment_id) {
    throw new HttpError(409, 'รหัส LAB ถูกผูกกับเครื่องมือ Portal อื่นแล้ว')
  }
  const { error } = await admin.from('bm_portal_equipment_refs')
    .upsert(row, { onConflict: 'portal_equipment_id' })
  if (error) throw new HttpError(500, error.message)
}

export async function refreshPortalEquipmentReference(equipmentId: string): Promise<PortalEquipmentReference> {
  const normalizedId = equipmentId.trim()
  if (!normalizedId) throw new HttpError(400, 'Missing Portal equipment UUID')
  const { data: cached, error: cachedError } = await getAdminClient().from('bm_portal_equipment_refs')
    .select('portal_equipment_id,lab_code').eq('portal_equipment_id', normalizedId).maybeSingle()
  if (cachedError) throw new HttpError(500, cachedError.message)
  if (!cached) throw new HttpError(404, 'Portal equipment reference not found')
  const code = text(cached.lab_code).trim().toUpperCase()
  if (!code) throw new HttpError(409, 'Portal equipment has no valid LAB code')
  const portal = await fetchPortalEquipmentByLabCode(code)
  if (portal.portal_equipment_id !== normalizedId || portal.cbh_code?.trim().toUpperCase() !== code) {
    throw new HttpError(409, 'Portal LAB code or equipment UUID changed; reload before continuing')
  }
  const row = portalReferenceRow(portal, code)
  await upsertPortalReference(row)
  return toPortalEquipmentReference(row)
}

async function refreshNewPortalReferences(module: PortalEquipmentModule, entityId: string, equipmentIds: string[]) {
  const admin = getAdminClient()
  const { data: currentLinks, error: currentLinksError } = await admin.from('bm_portal_equipment_links')
    .select('portal_equipment_id').eq('module', module).eq('entity_id', entityId)
  if (currentLinksError) throw new HttpError(500, currentLinksError.message)
  const currentIds = new Set((currentLinks ?? []).map((row) => text(row.portal_equipment_id)))
  const newIds = equipmentIds.filter((id) => !currentIds.has(id))
  if (!newIds.length) return

  for (const id of newIds) {
    const reference = await refreshPortalEquipmentReference(id)
    if (!canLinkPortalEquipmentStatus(reference.status)) {
      throw new HttpError(409, 'เลือกเชื่อมได้เฉพาะเครื่องมือ Portal สถานะ Active')
    }
  }
}
export async function getPortalEquipmentReferences(): Promise<PortalEquipmentReference[]> {
  const { data, error } = await getAdminClient().from('bm_portal_equipment_refs')
    .select('portal_equipment_id,lab_code,name,model,serial_number,status,portal_url').order('lab_code')
  if (error) throw new HttpError(500, error.message)
  return ((data ?? []) as Row[]).map(toPortalEquipmentReference)
}
export async function getPortalEquipmentModuleLinks(module: PortalEquipmentModule) {
  const { data, error } = await getAdminClient().from('bm_portal_equipment_links')
    .select('entity_id,portal_equipment_id').eq('module', module)
  if (error) throw new HttpError(500, error.message)
  return (data ?? []) as Array<{ entity_id: string; portal_equipment_id: string }>
}
export async function replacePortalEquipmentLinks(
  actor: BmActor,
  module: PortalEquipmentModule,
  entityId: string,
  equipmentIds: string[],
) {
  if (actor.role === 'Assistant') throw new HttpError(403, 'ไม่มีสิทธิ์เชื่อมเครื่องมือ')
  if ((module === 'iqc' || module === 'eqa') && actor.role !== 'Admin') throw new HttpError(403, 'เฉพาะ Admin สามารถเชื่อมเครื่องมือ IQC/EQA')
  const ids = [...new Set(equipmentIds.filter(Boolean))]
  if (module === 'iqc' && ids.length > 1) throw new HttpError(400, 'IQC เลือกได้หนึ่งเครื่องมือต่อ Instrument')
  await refreshNewPortalReferences(module, entityId, ids)
  const { error } = await getAdminClient().rpc('replace_bm_portal_equipment_links', {
    p_module: module, p_entity_id: entityId, p_equipment_ids: ids, p_actor: actor.id,
  })
  if (error) throw new HttpError(400, error.message)
}
export async function lookupAndCachePortalEquipment(actor: BmActor, labCode: string) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'เฉพาะ Admin สามารถเพิ่มเครื่องมืออ้างอิง')
  const code = labCode.trim().toUpperCase()
  if (!/^LAB-(?:BM|OL|SR)-[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(code)) {
    throw new HttpError(400, 'กรุณากรอกรหัส LAB-BM / LAB-OL ที่ถูกต้อง')
  }
  const portal = await fetchPortalEquipmentByLabCode(code)
  if (portal.cbh_code?.toUpperCase() !== code) throw new HttpError(502, 'Portal ส่งรหัสเครื่องมือไม่ตรงกับที่ค้นหา')
  const row = portalReferenceRow(portal, code)
  await upsertPortalReference(row)
  return toPortalEquipmentReference(row)
}
