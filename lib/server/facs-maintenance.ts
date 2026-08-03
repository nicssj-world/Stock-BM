import type { BmActor } from '@/lib/bm/types'
import { todayBangkok } from '@/lib/bm/rules'
import { responsibleCodeForDisplayName } from '@/lib/bm/responsible-codes'
import { FACS_DAILY_TASKS, FACS_MONTHLY_TASKS, type FacsMaintenanceFrequency, type FacsMaintenanceWorkspace, type FacsTaskResult } from '@/lib/equipment/facs-maintenance'
import { getAdminClient } from '@/lib/supabase/admin'
import { HttpError } from '@/lib/server/errors'
import { writeAudit } from '@/lib/server/audit'

type Row = Record<string, unknown>
const string = (value: unknown) => typeof value === 'string' ? value : ''
const nullable = (value: unknown) => typeof value === 'string' && value ? value : null
function fail(error: { message: string } | null) { if (error) throw new HttpError(400, error.message) }
function assertStaff(actor: BmActor) { if (actor.role === 'Assistant') throw new HttpError(403, 'Equipment permission required') }
function assertAdmin(actor: BmActor) { if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required') }
function periodFor(frequency: FacsMaintenanceFrequency, date: string) { return frequency === 'daily' ? date.slice(0, 7) : date.slice(0, 4) }
function isWeekend(date: string) { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return day === 0 || day === 6 }
function expectedTaskCount(frequency: FacsMaintenanceFrequency) { return frequency === 'daily' ? FACS_DAILY_TASKS.length : FACS_MONTHLY_TASKS.length }

async function facsEquipment() {
  const admin = getAdminClient()
  const { data, error } = await admin.from('bm_equipment').select('id,code,name').eq('code', 'FACSLYRIC').maybeSingle()
  fail(error)
  if (data) return data as Row
  const fallback = await admin.from('bm_equipment').select('id,code,name').ilike('name', '%FACSLyric%').limit(2)
  fail(fallback.error)
  if ((fallback.data ?? []).length > 1) throw new HttpError(409, 'พบ FACSLyric มากกว่าหนึ่งรายการ กรุณากำหนดรหัสเครื่องเป็น FACSLYRIC')
  return (fallback.data?.[0] ?? null) as Row | null
}
async function assertUnlocked(equipmentId: string, frequency: FacsMaintenanceFrequency, performedOn: string) {
  const { data, error } = await getAdminClient().from('bm_equipment_routine_reviews').select('id').eq('equipment_id', equipmentId).eq('frequency', frequency).eq('period', periodFor(frequency, performedOn)).maybeSingle()
  fail(error)
  if (data) throw new HttpError(409, 'งวดนี้ตรวจและล็อกแล้ว')
}

export async function getFacsMaintenanceWorkspace(actor: BmActor): Promise<FacsMaintenanceWorkspace> {
  assertStaff(actor)
  const [equipment, entriesResult, holidaysResult, reviewerResult, reviewsResult, usersResult] = await Promise.all([
    facsEquipment(),
    getAdminClient().from('bm_equipment_routine_maintenance').select('*').order('performed_on', { ascending: false }).limit(1000),
    getAdminClient().from('bm_equipment_routine_holidays').select('date,note').order('date', { ascending: false }),
    getAdminClient().from('bm_equipment_routine_reviewers').select('equipment_id,reviewer_id').limit(100),
    getAdminClient().from('bm_equipment_routine_reviews').select('*').order('reviewed_at', { ascending: false }).limit(1000),
    getAdminClient().from('nipt_users').select('id,display_name,is_active').eq('is_active', true).order('display_name'),
  ])
  fail(entriesResult.error); fail(holidaysResult.error); fail(reviewerResult.error); fail(reviewsResult.error); fail(usersResult.error)
  const users = ((usersResult.data ?? []) as Row[]).map((row) => ({ id: string(row.id), displayName: string(row.display_name) }))
  const names = new Map(users.map((user) => [user.id, user.displayName]))
  const equipmentId = equipment ? string(equipment.id) : ''
  const reviewerRow = ((reviewerResult.data ?? []) as Row[]).find((row) => string(row.equipment_id) === equipmentId)
  return {
    equipment: equipment ? { id: equipmentId, code: string(equipment.code), name: string(equipment.name) } : null,
    entries: ((entriesResult.data ?? []) as Row[]).filter((row) => string(row.equipment_id) === equipmentId).map((row) => ({
      id: string(row.id), equipmentId: string(row.equipment_id), frequency: string(row.frequency) as FacsMaintenanceFrequency, performedOn: string(row.performed_on),
      taskResults: Array.isArray(row.task_results) ? row.task_results as FacsTaskResult[] : [], note: nullable(row.note), operatorName: string(row.operator_name), operatorCode: string(row.operator_code), createdAt: string(row.created_at),
    })),
    holidays: ((holidaysResult.data ?? []) as Row[]).map((row) => ({ date: string(row.date), note: nullable(row.note) })),
    reviews: ((reviewsResult.data ?? []) as Row[]).filter((row) => string(row.equipment_id) === equipmentId).map((row) => ({ id: string(row.id), frequency: string(row.frequency) as FacsMaintenanceFrequency, period: string(row.period), reviewedByName: names.get(string(row.reviewed_by)) ?? '-', reviewedAt: string(row.reviewed_at) })),
    reviewerId: reviewerRow ? string(reviewerRow.reviewer_id) : null, users, today: todayBangkok(),
  }
}

export async function logFacsMaintenance(input: { frequency: FacsMaintenanceFrequency; performedOn: string; taskResults: FacsTaskResult[]; note?: string | null }, actor: BmActor) {
  assertStaff(actor)
  const equipment = await facsEquipment()
  if (!equipment) throw new HttpError(404, 'ยังไม่ได้ลงทะเบียนเครื่อง FACSLYRIC ใน Equipment')
  const equipmentId = string(equipment.id)
  const today = todayBangkok()
  if (input.performedOn > today) throw new HttpError(400, 'เลือกวันในอนาคตไม่ได้')
  if (actor.role !== 'Admin' && ((input.frequency === 'daily' && input.performedOn !== today) || (input.frequency === 'monthly' && input.performedOn.slice(0, 7) !== today.slice(0, 7)))) throw new HttpError(403, 'เฉพาะ Admin ที่บันทึกย้อนหลังได้')
  if (input.frequency === 'daily' && isWeekend(input.performedOn)) throw new HttpError(409, 'วันเสาร์-อาทิตย์ไม่มี Maintenance')
  const { data: holiday, error: holidayError } = await getAdminClient().from('bm_equipment_routine_holidays').select('date').eq('date', input.performedOn).maybeSingle()
  fail(holidayError)
  if (input.frequency === 'daily' && holiday) throw new HttpError(409, 'วันนี้กำหนดเป็นวันหยุด/ไม่ใช้งาน')
  if (input.taskResults.length !== expectedTaskCount(input.frequency)) throw new HttpError(400, 'จำนวนรายการ Checklist ไม่ถูกต้อง')
  if (input.taskResults.some((item) => !['done', 'not-applicable', 'not-done'].includes(item.state))) throw new HttpError(400, 'สถานะ Checklist ไม่ถูกต้อง')
  await assertUnlocked(equipmentId, input.frequency, input.performedOn)
  const operatorCode = responsibleCodeForDisplayName(actor.displayName)
  if (!operatorCode) throw new HttpError(400, 'ไม่พบรหัสย่อของผู้ใช้รายนี้ กรุณาเพิ่มใน Initial mapping ก่อน')
  const { data, error } = await getAdminClient().from('bm_equipment_routine_maintenance').insert({ equipment_id: equipmentId, frequency: input.frequency, performed_on: input.performedOn, task_results: input.taskResults, note: input.note?.trim() || null, operator_id: actor.id, operator_name: actor.displayName, operator_code: operatorCode }).select('id').single()
  if ((error as { code?: string } | null)?.code === '23505') throw new HttpError(409, 'บันทึก Checklist ของงวดนี้แล้ว')
  fail(error)
  await writeAudit(actor, 'equipment.facs-maintenance.log', 'equipment-facs-maintenance', string((data as Row).id), { frequency: input.frequency, performedOn: input.performedOn, operatorCode })
  return getFacsMaintenanceWorkspace(actor)
}

export async function setFacsReviewer(reviewerId: string, actor: BmActor) {
  assertAdmin(actor); const equipment = await facsEquipment(); if (!equipment) throw new HttpError(404, 'ไม่พบ FACSLYRIC')
  const { error } = await getAdminClient().from('bm_equipment_routine_reviewers').upsert({ equipment_id: string(equipment.id), reviewer_id: reviewerId, updated_by: actor.id, updated_at: new Date().toISOString() })
  fail(error); await writeAudit(actor, 'equipment.facs-maintenance.reviewer.set', 'equipment', string(equipment.id), { reviewerId }); return getFacsMaintenanceWorkspace(actor)
}
export async function setFacsHoliday(date: string, note: string | null, actor: BmActor) {
  assertAdmin(actor); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Invalid holiday date')
  const { error } = await getAdminClient().from('bm_equipment_routine_holidays').upsert({ date, note: note?.trim() || null, created_by: actor.id })
  fail(error); await writeAudit(actor, 'equipment.facs-maintenance.holiday.set', 'equipment-holiday', date, { note }); return getFacsMaintenanceWorkspace(actor)
}
export async function reviewFacsPeriod(frequency: FacsMaintenanceFrequency, period: string, actor: BmActor) {
  const equipment = await facsEquipment(); if (!equipment) throw new HttpError(404, 'ไม่พบ FACSLYRIC')
  const { data: assigned, error: assignedError } = await getAdminClient().from('bm_equipment_routine_reviewers').select('reviewer_id').eq('equipment_id', string(equipment.id)).maybeSingle(); fail(assignedError)
  if (!assigned || string((assigned as Row).reviewer_id) !== actor.id) throw new HttpError(403, 'คุณไม่ได้รับมอบหมายเป็นผู้ตรวจ FACSLYRIC')
  const { error } = await getAdminClient().from('bm_equipment_routine_reviews').insert({ equipment_id: string(equipment.id), frequency, period, reviewed_by: actor.id }); if ((error as { code?: string } | null)?.code === '23505') throw new HttpError(409, 'งวดนี้ล็อกแล้ว'); fail(error)
  await writeAudit(actor, 'equipment.facs-maintenance.review.lock', 'equipment-facs-review', `${frequency}:${period}`, {}); return getFacsMaintenanceWorkspace(actor)
}
export async function unlockFacsPeriod(frequency: FacsMaintenanceFrequency, period: string, actor: BmActor) {
  assertAdmin(actor); const equipment = await facsEquipment(); if (!equipment) throw new HttpError(404, 'ไม่พบ FACSLYRIC')
  const { error } = await getAdminClient().from('bm_equipment_routine_reviews').delete().eq('equipment_id', string(equipment.id)).eq('frequency', frequency).eq('period', period); fail(error)
  await writeAudit(actor, 'equipment.facs-maintenance.review.unlock', 'equipment-facs-review', `${frequency}:${period}`, {}); return getFacsMaintenanceWorkspace(actor)
}

export async function deleteFacsMaintenanceEntry(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data, error } = await admin.from('bm_equipment_routine_maintenance').select('equipment_id,frequency,performed_on').eq('id', id).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบรายการ Maintenance')
  const row = data as Row
  await assertUnlocked(string(row.equipment_id), string(row.frequency) as FacsMaintenanceFrequency, string(row.performed_on))
  const { error: deleteError } = await admin.from('bm_equipment_routine_maintenance').delete().eq('id', id)
  fail(deleteError)
  await writeAudit(actor, 'equipment.facs-maintenance.delete', 'equipment-facs-maintenance', id, { frequency: row.frequency, performedOn: row.performed_on })
  return getFacsMaintenanceWorkspace(actor)
}
