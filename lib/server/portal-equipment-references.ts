import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchPortalEquipmentByLabCode } from '@/lib/server/equipment-sync'

type Row = Record<string, unknown>
export type PortalEquipmentReference = {
  id: string
  code: string
  name: string
  model: string | null
  status: 'active' | 'maintenance' | 'out_of_service' | 'decommissioned'
  portalUrl: string | null
}
export type PortalEquipmentModule = 'iqc' | 'eqa' | 'stock'

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
function normalizeStatus(value: unknown): PortalEquipmentReference['status'] {
  const status = text(value).trim().toLowerCase()
  if (status === 'active' || status === 'maintenance' || status === 'out_of_service' || status === 'decommissioned') return status
  // Unknown Portal status must never silently be treated as active.
  return 'out_of_service'
}
export function toPortalEquipmentReference(row: Row): PortalEquipmentReference {
  return {
    id: text(row.portal_equipment_id),
    code: text(row.lab_code),
    name: text(row.name),
    model: row.model == null ? null : text(row.model),
    status: normalizeStatus(row.status),
    portalUrl: row.portal_url == null ? null : text(row.portal_url),
  }
}
export async function getPortalEquipmentReferences(): Promise<PortalEquipmentReference[]> {
  const { data, error } = await getAdminClient().from('bm_portal_equipment_refs')
    .select('portal_equipment_id,lab_code,name,model,status,portal_url').order('lab_code')
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
  const name = portal.equipment_type.trim()
  const row = {
    portal_equipment_id: portal.portal_equipment_id,
    lab_code: code,
    name,
    model: portal.model || null,
    status: normalizeStatus(portal.portal_status),
    portal_url: portal.portal_url || null,
    synced_at: new Date().toISOString(),
  }
  const admin = getAdminClient()
  // Guard against reassigning an issued LAB code to a different Portal UUID.
  const { data: existing, error: lookupError } = await admin.from('bm_portal_equipment_refs')
    .select('portal_equipment_id').eq('lab_code', code).maybeSingle()
  if (lookupError) throw new HttpError(500, lookupError.message)
  if (existing && existing.portal_equipment_id !== row.portal_equipment_id) throw new HttpError(409, 'รหัส LAB ถูกผูกกับเครื่องมือ Portal อื่นแล้ว')
  const { error } = await admin.from('bm_portal_equipment_refs')
    .upsert(row, { onConflict: 'portal_equipment_id' })
  if (error) throw new HttpError(500, error.message)
  return toPortalEquipmentReference(row)
}
