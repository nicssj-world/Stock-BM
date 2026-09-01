import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { todayBangkok } from '@/lib/bm/rules'
import { type FacsMaintenanceFrequency, type FacsMaintenanceWorkspace, type FacsTaskResult } from '@/lib/equipment/facs-maintenance'
import { currentRoutineVersion, routineOccurrenceForPlannedDate, type RoutineFrequency } from '@/lib/equipment/routine-maintenance'
import { getAdminClient } from '@/lib/supabase/admin'
import { HttpError } from '@/lib/server/errors'
import { writeAudit } from '@/lib/server/audit'
import {
  deleteRoutineMaintenanceEntry,
  getRoutineWorkspace,
  logRoutineMaintenance,
  reviewRoutinePeriod,
  setRoutineHoliday,
  unlockRoutinePeriod,
} from '@/lib/server/routine-maintenance'

type Row = Record<string, unknown>

function string(value: unknown) { return typeof value === 'string' ? value : '' }
function fail(error: { message: string } | null) { if (error) throw new HttpError(400, error.message) }

async function facsEquipment() {
  const { data, error } = await getAdminClient().from('bm_equipment').select('id,code,name').eq('code', 'FACSLYRIC').maybeSingle()
  fail(error)
  if (data) return data as Row
  const fallback = await getAdminClient().from('bm_equipment').select('id,code,name').ilike('name', '%FACSLyric%').limit(2)
  fail(fallback.error)
  if ((fallback.data ?? []).length > 1) throw new HttpError(409, 'พบ FACSLyric มากกว่าหนึ่งรายการ กรุณากำหนดรหัสเครื่องเป็น FACSLYRIC')
  return (fallback.data?.[0] ?? null) as Row | null
}

function genericFrequency(value: FacsMaintenanceFrequency) { return value as RoutineFrequency }

async function facsWorkspace(actor: BmActor) {
  const equipment = await facsEquipment()
  if (!equipment) return null
  return getRoutineWorkspace(actor, string(equipment.id))
}

function formForFrequency(workspace: Awaited<ReturnType<typeof facsWorkspace>>, frequency: FacsMaintenanceFrequency) {
  return workspace?.forms.find((form) => form.versions.some((version) => version.frequency === frequency)) ?? null
}

export async function getFacsMaintenanceWorkspace(actor: BmActor): Promise<FacsMaintenanceWorkspace> {
  const workspace = await facsWorkspace(actor)
  if (!workspace) return { equipment: null, entries: [], holidays: [], reviews: [], reviewerId: null, users: [], today: todayBangkok() }
  const dailyForm = formForFrequency(workspace, 'daily')
  const monthlyForm = formForFrequency(workspace, 'monthly')
  return {
    equipment: workspace.equipment ? { id: workspace.equipment.id, code: workspace.equipment.code, name: workspace.equipment.name } : null,
    entries: workspace.entries.filter((entry) => entry.frequency === 'daily' || entry.frequency === 'monthly').map((entry) => ({
      id: entry.id,
      equipmentId: entry.equipmentId,
      frequency: entry.frequency as FacsMaintenanceFrequency,
      performedOn: entry.scheduledOn,
      taskResults: entry.taskResults.map((item) => ({ state: item.state })),
      note: entry.note,
      operatorName: entry.operatorName,
      operatorCode: entry.operatorCode,
      createdAt: entry.createdAt,
    })),
    holidays: workspace.holidays.map((holiday) => ({ date: holiday.date, note: holiday.note })),
    reviews: workspace.reviews.filter((review) => review.frequency === 'daily' || review.frequency === 'monthly').map((review) => ({ id: review.id, frequency: review.frequency as FacsMaintenanceFrequency, period: review.period, reviewedByName: review.reviewedByName, reviewedAt: review.reviewedAt })),
    reviewerId: dailyForm?.reviewerId ?? monthlyForm?.reviewerId ?? null,
    users: workspace.users,
    today: workspace.today,
  }
}

export async function logFacsMaintenance(input: { frequency: FacsMaintenanceFrequency; performedOn: string; taskResults: FacsTaskResult[]; note?: string | null }, actor: BmActor) {
  const workspace = await facsWorkspace(actor)
  if (!workspace?.equipment) throw new HttpError(404, 'ยังไม่ได้ลงทะเบียนเครื่อง FACSLYRIC ใน Equipment')
  const form = formForFrequency(workspace, input.frequency)
  if (!form) throw new HttpError(404, `ยังไม่มีฟอร์ม ${input.frequency} ของ FACSLYRIC`)
  const version = currentRoutineVersion(form, workspace.today)
  if (!version || version.frequency !== input.frequency) throw new HttpError(400, 'Version ของฟอร์ม FACSLYRIC ไม่ถูกต้อง')
  const occurrence = routineOccurrenceForPlannedDate(version, input.performedOn, new Set(workspace.holidays.filter((holiday) => holiday.formId === form.id).map((holiday) => holiday.date)))
  if (!occurrence) throw new HttpError(400, 'วันที่นี้ไม่ตรงกับรอบของฟอร์ม FACSLYRIC')
  const taskResults = version.items.map((item, index) => ({ itemId: item.id, label: item.label, state: input.taskResults[index]?.state ?? 'not-done' as const }))
  await logRoutineMaintenance({ formId: form.id, versionId: version.id, plannedOn: occurrence.plannedOn, scheduledOn: occurrence.scheduledOn, taskResults, note: input.note ?? null, source: 'internal' }, actor)
  return getFacsMaintenanceWorkspace(actor)
}

export async function setFacsReviewer(reviewerId: string, actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
  const workspace = await facsWorkspace(actor)
  if (!workspace?.equipment) throw new HttpError(404, 'ไม่พบ FACSLYRIC')
  const forms = workspace.forms.filter((form) => form.versions.some((version) => version.frequency === 'daily' || version.frequency === 'monthly'))
  const admin = getAdminClient()
  for (const form of forms) {
    const { error } = await admin.from('bm_equipment_routine_forms').update({ reviewer_id: reviewerId, updated_by: actor.id, updated_at: new Date().toISOString() }).eq('id', form.id)
    fail(error)
  }
  await writeAudit(actor, 'equipment.facs-maintenance.reviewer.set', 'equipment', workspace.equipment.id, { reviewerId })
  return getFacsMaintenanceWorkspace(actor)
}

export async function setFacsHoliday(date: string, note: string | null, actor: BmActor) {
  const workspace = await facsWorkspace(actor)
  if (!workspace) throw new HttpError(404, 'ไม่พบ FACSLYRIC')
  const form = formForFrequency(workspace, 'daily')
  if (!form) throw new HttpError(404, 'ยังไม่มีฟอร์ม Daily ของ FACSLYRIC')
  await setRoutineHoliday(form.id, date, note, actor)
  return getFacsMaintenanceWorkspace(actor)
}

export async function reviewFacsPeriod(frequency: FacsMaintenanceFrequency, period: string, actor: BmActor) {
  const workspace = await facsWorkspace(actor)
  if (!workspace) throw new HttpError(404, 'ไม่พบ FACSLYRIC')
  const form = formForFrequency(workspace, frequency)
  if (!form) throw new HttpError(404, `ยังไม่มีฟอร์ม ${frequency} ของ FACSLYRIC`)
  await reviewRoutinePeriod({ formId: form.id, frequency: genericFrequency(frequency), period }, actor)
  return getFacsMaintenanceWorkspace(actor)
}

export async function unlockFacsPeriod(frequency: FacsMaintenanceFrequency, period: string, actor: BmActor) {
  const workspace = await facsWorkspace(actor)
  if (!workspace) throw new HttpError(404, 'ไม่พบ FACSLYRIC')
  const form = formForFrequency(workspace, frequency)
  if (!form) throw new HttpError(404, `ยังไม่มีฟอร์ม ${frequency} ของ FACSLYRIC`)
  await unlockRoutinePeriod({ formId: form.id, frequency: genericFrequency(frequency), period }, actor)
  return getFacsMaintenanceWorkspace(actor)
}

export async function deleteFacsMaintenanceEntry(id: string, actor: BmActor) {
  await deleteRoutineMaintenanceEntry(id, actor)
  return getFacsMaintenanceWorkspace(actor)
}
