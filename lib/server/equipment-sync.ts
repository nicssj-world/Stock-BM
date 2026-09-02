import 'server-only'

import { z } from 'zod'
import type { BmActor } from '@/lib/bm/types'
import type { EquipmentSyncIssue, EquipmentSyncRun } from '@/lib/equipment/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  buildSyncOperations,
  type EquipmentMatchIssue,
  type LocalEquipmentIdentity,
} from '@/lib/equipment/sync-matching'

export { buildSyncOperations }
export type { EquipmentMatchIssue, LocalEquipmentIdentity }

type RecordRow = Record<string, unknown>

const DEPARTMENT_CODES = ['BIOMOLECULAR', 'OUTLAB'] as const
const PAGE_SIZE = 200
const MAX_SNAPSHOT_PAGES = 1000
const EQUIPMENT_ATTACHMENT_BUCKET = 'bm-quality'
const PORTAL_PHOTO_MAX_BYTES = 20 * 1024 * 1024
const PORTAL_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])

const pmCalSummarySchema = z.object({
  portal_plan_id: z.string().uuid(),
  fiscal_year: z.number().int().nullable().optional(),
  calendar_month: z.number().int().min(1).max(12).nullable().optional(),
  cal_type: z.enum(['PM', 'CAL']).nullable().optional(),
  due_date: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  planned_cost: z.union([z.number(), z.string()]).nullable().optional(),
  record_status: z.string().nullable().optional(),
  version: z.number().int().nullable().optional(),
  completed_date: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
  certificate_no: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
}).passthrough()

export const portalEquipmentSchema = z.object({
  portal_equipment_id: z.string().uuid(),
  department_code: z.enum(DEPARTMENT_CODES),
  department_name: z.string(),
  equipment_type: z.string().trim().min(1),
  cbh_code: z.string().nullable().optional(),
  hospital_asset_no: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  portal_status: z.string().nullable().optional(),
  portal_location: z.string().nullable().optional(),
  portal_updated_at: z.string().nullable().optional(),
  pm_cal_summary: z.array(pmCalSummarySchema).default([]),
  portal_url: z.string().url().nullable().optional(),
  portal_photo_url: z.string().url().nullable().optional(),
})

const portalPageSchema = z.object({
  items: z.array(portalEquipmentSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  count: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  scope_codes: z.array(z.string()).optional(),
})

export type PortalEquipment = z.infer<typeof portalEquipmentSchema>

function integrationUrl() {
  const direct = process.env.PORTAL_EQUIPMENT_API_URL?.trim()
  if (direct) return direct
  const base = process.env.PORTAL_PUBLIC_BASE_URL?.trim()
  if (!base) throw new HttpError(503, 'ยังไม่ได้ตั้งค่า URL ของ Portal สำหรับ Sync')
  return `${base.replace(/\/$/, '')}/api/integrations/stock-bm/equipment`
}

async function fetchPortalPage(page: number, labCode?: string) {
  const token = process.env.STOCK_BM_INTEGRATION_TOKEN?.trim()
  if (!token) throw new HttpError(503, 'ยังไม่ได้ตั้งค่า Token สำหรับเชื่อมต่อ Portal')
  const url = new URL(integrationUrl())
  url.searchParams.set('page', String(page))
  url.searchParams.set('pageSize', String(PAGE_SIZE))
  if (labCode) url.searchParams.set('lab_code', labCode)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new HttpError(502, 'ไม่สามารถเชื่อมต่อ Portal ได้')
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new HttpError(502, 'Token เชื่อมต่อ Portal ไม่ถูกต้อง')
    throw new HttpError(502, `Portal ตอบกลับด้วยสถานะ ${response.status}`)
  }
  const parsed = portalPageSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new HttpError(502, 'รูปแบบข้อมูลจาก Portal ไม่ตรงกับสัญญา Sync')
  if (parsed.data.scope_codes && parsed.data.scope_codes.some((code) => !DEPARTMENT_CODES.includes(code as (typeof DEPARTMENT_CODES)[number]))) {
    throw new HttpError(502, 'Portal ส่งรหัสหน่วยงานที่อยู่นอกขอบเขต Stock-BM')
  }
  if (parsed.data.page !== page) throw new HttpError(502, 'Portal ส่งเลขหน้า Snapshot ไม่ถูกต้อง')
  return parsed.data
}

async function fetchCompletePortalSnapshot() {
  const first = await fetchPortalPage(1)
  const items = [...first.items]
  if (first.totalPages > MAX_SNAPSHOT_PAGES) throw new HttpError(502, 'Snapshot จาก Portal มีจำนวนหน้ามากเกินขอบเขต')
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await fetchPortalPage(page)
    if (next.totalPages !== first.totalPages || next.count !== first.count) {
      throw new HttpError(502, 'จำนวนข้อมูลใน Snapshot จาก Portal เปลี่ยนระหว่างการอ่าน')
    }
    items.push(...next.items)
  }
  if (items.length !== first.count) throw new HttpError(502, 'อ่าน Snapshot จาก Portal ได้ไม่ครบชุด')
  return items
}

function normalizeLabCode(value: string) {
  const code = value.trim().toUpperCase()
  if (!/^LAB-[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(code)) {
    throw new HttpError(400, 'กรุณาระบุรหัส LAB ในรูปแบบ LAB-XX-XX')
  }
  return code
}

async function fetchPortalEquipmentByLabCode(value: string) {
  const labCode = normalizeLabCode(value)
  const page = await fetchPortalPage(1, labCode)
  if (!page.items.length || page.count === 0) {
    throw new HttpError(404, `ไม่พบรหัส ${labCode} ใน Portal`)
  }
  if (page.count !== 1 || page.items.length !== 1) {
    throw new HttpError(409, `รหัส ${labCode} ใน Portal มีมากกว่าหนึ่งรายการ`)
  }
  return page.items[0]
}

type PreparedPortalPhoto = {
  storagePath: string
  fileName: string
  contentType: string
  sizeBytes: number
}

function photoExtension(contentType: string) {
  return {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/gif': 'gif',
  }[contentType] ?? 'img'
}

async function stagePortalPhoto(
  portal: PortalEquipment,
  runId: string,
  stagedPaths: string[],
): Promise<PreparedPortalPhoto | null> {
  const sourceUrl = portal.portal_photo_url
  if (!sourceUrl) return null

  let response: Response
  try {
    response = await fetch(sourceUrl, {
      method: 'GET',
      headers: { Accept: 'image/*' },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new HttpError(502, `ไม่สามารถดาวน์โหลดรูปเครื่องมือ ${portal.portal_equipment_id} จาก Portal ได้`)
  }
  if (!response.ok) {
    throw new HttpError(502, `Portal ส่งรูปเครื่องมือ ${portal.portal_equipment_id} กลับมาด้วยสถานะ ${response.status}`)
  }

  const contentType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase()
  if (!PORTAL_PHOTO_TYPES.has(contentType)) {
    throw new HttpError(502, `รูปเครื่องมือ ${portal.portal_equipment_id} จาก Portal ไม่ใช่ไฟล์รูปภาพที่รองรับ`)
  }
  const advertisedSize = Number(response.headers.get('content-length') ?? 0)
  if (advertisedSize > PORTAL_PHOTO_MAX_BYTES) {
    throw new HttpError(502, `รูปเครื่องมือ ${portal.portal_equipment_id} มีขนาดเกิน 20 MB`)
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch {
    throw new HttpError(502, `อ่านไฟล์รูปเครื่องมือ ${portal.portal_equipment_id} จาก Portal ไม่สำเร็จ`)
  }
  if (!bytes.byteLength || bytes.byteLength > PORTAL_PHOTO_MAX_BYTES) {
    throw new HttpError(502, `รูปเครื่องมือ ${portal.portal_equipment_id} มีขนาดไม่ถูกต้อง`)
  }

  const extension = photoExtension(contentType)
  const storagePath = `equipment/portal-sync/${portal.portal_equipment_id}/${runId}.${extension}`
  // Register the path before uploading so a partial Storage failure can still
  // be cleaned up by the outer sync failure handler.
  stagedPaths.push(storagePath)
  const { error } = await getAdminClient().storage.from(EQUIPMENT_ATTACHMENT_BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: false,
  })
  if (error) throw new HttpError(502, `เก็บรูปเครื่องมือ ${portal.portal_equipment_id} ใน Stock-BM ไม่สำเร็จ`)

  return {
    storagePath,
    fileName: `portal-photo-${portal.portal_equipment_id}.${extension}`,
    contentType,
    sizeBytes: bytes.byteLength,
  }
}

async function stagePortalPhotos(
  operations: readonly { portal: PortalEquipment; issue?: unknown }[],
  runId: string,
  stagedPaths: string[],
) {
  const targets = operations.filter((operation) => !operation.issue && operation.portal.portal_photo_url)
  const prepared = new Map<string, PreparedPortalPhoto>()

  // Keep a small amount of concurrency so a large equipment snapshot does not
  // hold every image in memory at once.
  for (let offset = 0; offset < targets.length; offset += 4) {
    const batch = targets.slice(offset, offset + 4)
    const results = await Promise.allSettled(batch.map((operation) => stagePortalPhoto(operation.portal, runId, stagedPaths)))
    let failure: unknown = null
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index]
      if (result.status === 'rejected') {
        failure ??= result.reason
        continue
      }
      if (result.value) {
        prepared.set(batch[index].portal.portal_equipment_id, result.value)
      }
    }
    if (failure) throw failure
  }
  return prepared
}

async function removeStoredPaths(paths: readonly string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (!uniquePaths.length) return
  await getAdminClient().storage.from(EQUIPMENT_ATTACHMENT_BUCKET).remove(uniquePaths).catch(() => {})
}

function portalPayloadWithoutPhotoUrl(portal: PortalEquipment) {
  const payload = { ...portal }
  delete payload.portal_photo_url
  return payload
}

async function getLocalIdentities(): Promise<LocalEquipmentIdentity[]> {
  const { data, error } = await getAdminClient()
    .from('bm_equipment')
    .select('id,portal_equipment_id,code,asset_number,serial_number,sync_state,status')
    .order('id', { ascending: true })
  if (error) throw new HttpError(500, 'อ่านข้อมูลเครื่องมือเดิมไม่สำเร็จ')
  return (data ?? []) as LocalEquipmentIdentity[]
}

async function getLocalEquipmentIdByLabCode(labCode: string) {
  const { data, error } = await getAdminClient()
    .from('bm_equipment')
    .select('id')
    .ilike('code', labCode)
    .order('id', { ascending: true })
  if (error) throw new HttpError(500, 'ค้นหาเครื่องมือ Stock-BM จากรหัส LAB ไม่สำเร็จ')
  if ((data ?? []).length > 1) throw new HttpError(409, `รหัส ${labCode} ซ้ำใน Stock-BM`) 
  return data?.[0] ? asString((data[0] as RecordRow).id) : null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function mapSyncRun(row: RecordRow, names: Map<string, string>): EquipmentSyncRun {
  return {
    id: asString(row.id),
    actorName: names.get(asString(row.actor_id)) ?? null,
    status: asString(row.status) as EquipmentSyncRun['status'],
    startedAt: asString(row.started_at),
    finishedAt: nullableString(row.finished_at),
    sourceCount: Number(row.source_count) || 0,
    createdCount: Number(row.created_count) || 0,
    updatedCount: Number(row.updated_count) || 0,
    archivedCount: Number(row.archived_count) || 0,
    issueCount: Number(row.issue_count) || 0,
    errorMessage: nullableString(row.error_message),
  }
}

export async function getEquipmentSyncOverview(): Promise<{ lastRun: EquipmentSyncRun | null; openIssues: EquipmentSyncIssue[] }> {
  const admin = getAdminClient()
  const [{ data: runs, error: runsError }, { data: issues, error: issuesError }] = await Promise.all([
    admin.from('bm_equipment_sync_runs').select('*').order('started_at', { ascending: false }).limit(1),
    admin.from('bm_equipment_sync_issues').select('*').eq('issue_status', 'open').order('created_at', { ascending: false }).limit(100),
  ])
  if (runsError || issuesError) throw new HttpError(500, 'อ่านสถานะ Sync ไม่สำเร็จ')
  const actorIds = [...new Set((runs ?? []).map((row) => asString((row as RecordRow).actor_id)).filter(Boolean))]
  const names = new Map<string, string>()
  if (actorIds.length) {
    const { data: users, error } = await admin.from('nipt_users').select('id,display_name').in('id', actorIds)
    if (error) throw new HttpError(500, 'อ่านชื่อผู้ Sync ไม่สำเร็จ')
    for (const row of (users ?? []) as RecordRow[]) names.set(asString(row.id), asString(row.display_name))
  }
  return {
    lastRun: runs?.[0] ? mapSyncRun(runs[0] as RecordRow, names) : null,
    openIssues: ((issues ?? []) as RecordRow[]).map((row) => ({
      id: row.id == null ? "" : String(row.id),
      syncRunId: nullableString(row.sync_run_id),
      equipmentId: nullableString(row.equipment_id),
      portalEquipmentId: nullableString(row.portal_equipment_id),
      issueType: asString(row.issue_type) as EquipmentSyncIssue['issueType'],
      reason: asString(row.reason),
      candidateLocalIds: Array.isArray(row.candidate_local_ids) ? row.candidate_local_ids.map(String) : [],
      portalSnapshot: (row.portal_snapshot && typeof row.portal_snapshot === 'object' ? row.portal_snapshot : {}) as Record<string, unknown>,
      issueStatus: asString(row.issue_status) as EquipmentSyncIssue['issueStatus'],
      resolutionNote: nullableString(row.resolution_note),
      resolvedAt: nullableString(row.resolved_at),
      createdAt: asString(row.created_at),
    })),
  }
}

export async function syncEquipmentFromPortal(actor: BmActor) {
  if (actor.role === 'Assistant') throw new HttpError(403, 'เฉพาะ Staff หรือ Admin เท่านั้นที่ Sync เครื่องมือได้')
  const admin = getAdminClient()
  const { data: run, error: runError } = await admin
    .from('bm_equipment_sync_runs')
    .insert({ actor_id: actor.id, status: 'running' })
    .select('id')
    .single()
  if (runError || !run) throw new HttpError(500, 'เริ่มรายการ Sync ไม่สำเร็จ')
  const runId = asString((run as RecordRow).id)
  const stagedPhotoPaths: string[] = []

  try {
    const snapshot = await fetchCompletePortalSnapshot()
    const locals = await getLocalIdentities()
    const { operations, unmatchedLocalIds } = buildSyncOperations(snapshot, locals)
    const stagedPhotos = await stagePortalPhotos(operations, runId, stagedPhotoPaths)
    const operationsForDatabase = operations.map((operation) => {
      const photo = stagedPhotos.get(operation.portal.portal_equipment_id)
      return {
        ...operation,
        portal: portalPayloadWithoutPhotoUrl(operation.portal),
        ...(photo ? {
          portal_photo: {
            storage_path: photo.storagePath,
            file_name: photo.fileName,
            content_type: photo.contentType,
            size_bytes: photo.sizeBytes,
          },
        } : {}),
      }
    })
    const { data: result, error } = await admin.rpc('sync_bm_equipment_snapshot', {
      p_sync_run_id: runId,
      p_actor: actor.id,
      p_operations: operationsForDatabase,
      p_unmatched_local_ids: unmatchedLocalIds,
    })
    if (error) throw new HttpError(500, 'บันทึก Snapshot ลง Stock-BM ไม่สำเร็จ')
    const counts = (result ?? {}) as Record<string, unknown>
    const replacedPhotoPaths = Array.isArray(counts.replaced_photo_paths)
      ? counts.replaced_photo_paths.map(String).filter((path) => !stagedPhotoPaths.includes(path))
      : []
    await removeStoredPaths(replacedPhotoPaths)
    try {
      await writeAudit(actor, 'equipment.sync', 'equipment-sync-run', runId, {
        sourceCount: snapshot.length,
        createdCount: Number(counts.created_count) || 0,
        updatedCount: Number(counts.updated_count) || 0,
        archivedCount: Number(counts.archived_count) || 0,
        issueCount: Number(counts.issue_count) || 0,
      })
    } catch {
      // A successful data transaction must not be reported as failed only
      // because the optional audit insert is temporarily unavailable.
    }
    return { runId, counts }
  } catch (error) {
    await removeStoredPaths(stagedPhotoPaths)
    await admin.from('bm_equipment_sync_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: error instanceof HttpError ? error.message : 'Unexpected sync failure',
    }).eq('id', runId)
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'Sync จาก Portal ไม่สำเร็จ ข้อมูลเดิมยังไม่เปลี่ยนแปลง')
  }
}

/** Fetch and sync exactly one Portal equipment item by its LAB code. */
export async function syncEquipmentByLabCode(actor: BmActor, requestedLabCode: string) {
  if (actor.role === 'Assistant') throw new HttpError(403, 'เฉพาะ Staff หรือ Admin เท่านั้นที่ดึงเครื่องมือจาก Portal ได้')
  const labCode = normalizeLabCode(requestedLabCode)
  const admin = getAdminClient()
  const { data: run, error: runError } = await admin
    .from('bm_equipment_sync_runs')
    .insert({ actor_id: actor.id, status: 'running' })
    .select('id')
    .single()
  if (runError || !run) throw new HttpError(500, 'เริ่มรายการดึงข้อมูลเครื่องมือไม่สำเร็จ')
  const runId = asString((run as RecordRow).id)
  const stagedPhotoPaths: string[] = []

  try {
    const portal = await fetchPortalEquipmentByLabCode(labCode)
    const localEquipmentId = await getLocalEquipmentIdByLabCode(labCode)
    const photo = await stagePortalPhoto(portal, runId, stagedPhotoPaths)
    const { data: result, error } = await admin.rpc('sync_bm_equipment_by_lab_code', {
      p_sync_run_id: runId,
      p_actor: actor.id,
      p_portal: portalPayloadWithoutPhotoUrl(portal),
      p_local_equipment_id: localEquipmentId,
      p_portal_photo: photo ? {
        storage_path: photo.storagePath,
        file_name: photo.fileName,
        content_type: photo.contentType,
        size_bytes: photo.sizeBytes,
      } : null,
    })
    if (error) throw new HttpError(500, 'บันทึกเครื่องมือจาก Portal ลง Stock-BM ไม่สำเร็จ')
    const counts = (result ?? {}) as Record<string, unknown>
    const replacedPhotoPaths = Array.isArray(counts.replaced_photo_paths)
      ? counts.replaced_photo_paths.map(String).filter((path) => !stagedPhotoPaths.includes(path))
      : []
    await removeStoredPaths(replacedPhotoPaths)
    try {
      await writeAudit(actor, 'equipment.sync-by-lab-code', 'equipment-sync-run', runId, {
        labCode,
        sourceCount: 1,
        createdCount: Number(counts.created_count) || 0,
        updatedCount: Number(counts.updated_count) || 0,
      })
    } catch {
      // The equipment transaction has already succeeded; audit is supplementary.
    }
    return { runId, counts }
  } catch (error) {
    await removeStoredPaths(stagedPhotoPaths)
    await admin.from('bm_equipment_sync_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: error instanceof HttpError ? error.message : 'Unexpected sync failure',
    }).eq('id', runId)
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'ดึงข้อมูลจาก Portal ไม่สำเร็จ ข้อมูลเดิมยังไม่เปลี่ยนแปลง')
  }
}

export async function resolveEquipmentSyncIssue(
  issueId: string,
  action: 'resolve' | 'ignore',
  localEquipmentId: string | null,
  actor: BmActor,
) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'เฉพาะ Admin เท่านั้นที่จัดการ Issue Queue ได้')
  const admin = getAdminClient()
  if (action === 'resolve') {
    if (!localEquipmentId) throw new HttpError(400, 'กรุณาเลือกเครื่องมือ Stock-BM ที่ต้องการจับคู่')
    const { error } = await admin.rpc('resolve_bm_equipment_sync_issue', {
      p_issue_id: Number(issueId),
      p_local_equipment_id: localEquipmentId,
      p_actor: actor.id,
    })
    if (error) throw new HttpError(409, 'จับคู่ Issue ไม่สำเร็จ กรุณาตรวจสอบรายการอีกครั้ง')
  } else {
    const { data, error } = await admin
      .from('bm_equipment_sync_issues')
      .update({ issue_status: 'ignored', resolved_by: actor.id, resolved_at: new Date().toISOString(), resolution_note: 'ข้ามโดยผู้ดูแลระบบ' })
      .eq('id', Number(issueId))
      .eq('issue_status', 'open')
      .select('id')
      .maybeSingle()
    if (error) throw new HttpError(500, 'ปิด Issue ไม่สำเร็จ')
    if (!data) throw new HttpError(409, 'Issue นี้ถูกจัดการไปแล้ว')
  }
}
