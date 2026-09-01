import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import {
  actorCanBackfill,
  addRoutineFrequency,
  currentRoutineVersion,
  routineOccurrenceForPlannedDate,
  routinePeriodFor,
  routinePeriodKind,
  type RoutineFrequency,
  type RoutineMaintenanceEntry,
  type RoutineMaintenanceForm,
  type RoutineMaintenanceHoliday,
  type RoutineMaintenanceItem,
  type RoutineMaintenanceReview,
  type RoutineMaintenanceVersion,
  type RoutineMaintenanceWorkspace,
  type RoutineSource,
  type RoutineTaskResult,
  type RoutineTaskState,
} from '@/lib/equipment/routine-maintenance'
import { todayBangkok } from '@/lib/bm/rules'
import { responsibleCodeForDisplayName } from '@/lib/bm/responsible-codes'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type Row = Record<string, unknown>
type DbError = { message: string; code?: string } | null

export type RoutineMaintenanceFormInput = {
  equipmentId: string
  name: string
  frequency: RoutineFrequency
  startsOn: string
  reviewerId?: string | null
  items: string[]
  active?: boolean
}

export type RoutineMaintenanceFormUpdateInput = Omit<RoutineMaintenanceFormInput, 'equipmentId'> & {
  formId: string
}

export type RoutineMaintenanceLogInput = {
  equipmentId?: string
  formId: string
  versionId: string
  plannedOn: string
  scheduledOn: string
  taskResults: { itemId: string; label?: string; state: RoutineTaskState }[]
  note?: string | null
  idempotencyKey?: string | null
  source?: RoutineSource
}

export type RoutineMaintenanceReviewInput = {
  formId: string
  frequency: RoutineFrequency
  period: string
}

export type RoutineReportCatalog = {
  equipment: { id: string; code: string; name: string; status: string }[]
  forms: { id: string; equipmentId: string; name: string; active: boolean }[]
}

function string(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullable(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function number(value: unknown) {
  return typeof value === 'number' ? value : Number(value) || 0
}

function fail(error: DbError) {
  if (error) throw new HttpError(400, error.message)
}

function isDuplicate(error: DbError) {
  return error?.code === '23505'
}

function assertStaff(actor: BmActor) {
  if (actor.role === 'Assistant') throw new HttpError(403, 'Equipment permission required')
}

function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
}

function validFrequency(value: unknown): value is RoutineFrequency {
  return value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'yearly'
}

function validSource(value: unknown): value is RoutineSource {
  return value === 'internal' || value === 'qr'
}

function validState(value: unknown): value is RoutineTaskState {
  return value === 'done' || value === 'not-applicable' || value === 'not-done'
}

function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function ensureDate(value: string, label = 'วันที่') {
  if (!isDateKey(value)) throw new HttpError(400, `${label}ไม่ถูกต้อง`)
}

function ensurePeriod(frequency: RoutineFrequency, period: string) {
  const kind = routinePeriodKind(frequency)
  const valid = kind === 'month' ? /^\d{4}-\d{2}$/.test(period) : /^\d{4}$/.test(period)
  if (!valid) throw new HttpError(400, 'ช่วงเวลาสำหรับ Review ไม่ถูกต้อง')
  if (kind === 'month' && (Number(period.slice(5, 7)) < 1 || Number(period.slice(5, 7)) > 12)) throw new HttpError(400, 'เดือนสำหรับ Review ไม่ถูกต้อง')
}

function cleanItems(items: string[]) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 80) {
    throw new HttpError(400, 'Checklist ต้องมีอย่างน้อย 1 รายการและไม่เกิน 80 รายการ')
  }
  const labels = items.map((item) => item.trim())
  if (labels.some((item) => !item || item.length > 500)) throw new HttpError(400, 'รายการ Checklist ไม่ถูกต้อง')
  if (new Set(labels.map((item) => item.toLocaleLowerCase())).size !== labels.length) {
    throw new HttpError(409, 'ห้ามมีรายการ Checklist ซ้ำกัน')
  }
  return labels
}

function cleanFormName(name: string) {
  const value = name.trim()
  if (!value || value.length > 200) throw new HttpError(400, 'ชื่อฟอร์มไม่ถูกต้อง')
  return value
}

function reviewerCode(actor: BmActor) {
  const mapped = responsibleCodeForDisplayName(actor.displayName)
  if (mapped) return mapped
  const initials = actor.displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
  return initials || actor.id.slice(0, 4).toUpperCase()
}

async function equipmentById(equipmentId: string) {
  const { data, error } = await getAdminClient()
    .from('bm_equipment')
    .select('id,code,name,qr_token,status')
    .eq('id', equipmentId)
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบเครื่องมือ')
  return data as Row
}

export async function resolveRoutineEquipmentToken(token: string) {
  if (!token.trim()) return null
  const { data, error } = await getAdminClient()
    .from('bm_equipment')
    .select('id,code,name,qr_token,status')
    .eq('qr_token', token)
    .maybeSingle()
  fail(error)
  if (!data || string((data as Row).status) === 'decommissioned') return null
  const row = data as Row
  return {
    id: string(row.id),
    code: string(row.code),
    name: string(row.name),
    qrToken: string(row.qr_token),
  }
}

async function rowsFor(table: string, column: string, values: string[]) {
  if (!values.length) return [] as Row[]
  const { data, error } = await getAdminClient().from(table).select('*').in(column, values)
  fail(error)
  return (data ?? []) as Row[]
}

function mapItems(rows: Row[]) {
  return rows
    .map((row) => ({
      id: string(row.id),
      position: number(row.position),
      label: string(row.label),
    } satisfies RoutineMaintenanceItem))
    .sort((a, b) => a.position - b.position)
}

function mapVersions(versionRows: Row[], itemRows: Row[]) {
  const itemMap = new Map<string, Row[]>()
  for (const row of itemRows) itemMap.set(string(row.version_id), [...(itemMap.get(string(row.version_id)) ?? []), row])
  return versionRows
    .map((row) => ({
      id: string(row.id),
      formId: string(row.form_id),
      versionNumber: number(row.version_number),
      frequency: validFrequency(row.frequency) ? row.frequency : 'daily',
      startsOn: string(row.starts_on),
      // The effective date is represented by starts_on in the current schema.
      effectiveOn: string(row.starts_on),
      items: mapItems(itemMap.get(string(row.id)) ?? []),
    } satisfies RoutineMaintenanceVersion))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.versionNumber - b.versionNumber)
}

function mapTaskResults(value: unknown, items: RoutineMaintenanceItem[]) {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw, index) => {
    const row = raw && typeof raw === 'object' ? raw as Row : {}
    const item = items[index]
    const itemId = string(row.itemId) || string(row.item_id) || item?.id
    if (!itemId) return []
    return [{
      itemId,
      label: string(row.label) || item?.label || `Checklist item ${index + 1}`,
      state: validState(row.state) ? row.state : 'not-done',
    } satisfies RoutineTaskResult]
  })
}

function mapForms(formRows: Row[], versions: RoutineMaintenanceVersion[]) {
  return formRows
    .map((row) => ({
      id: string(row.id),
      equipmentId: string(row.equipment_id),
      name: string(row.name),
      active: Boolean(row.is_active),
      reviewerId: nullable(row.reviewer_id),
      versions: versions.filter((version) => version.formId === string(row.id)),
    } satisfies RoutineMaintenanceForm))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
}

function mapEntries(rows: Row[], versions: Map<string, RoutineMaintenanceVersion>) {
  return rows.map((row) => {
    const version = versions.get(string(row.version_id))
    const frequency = validFrequency(row.frequency) ? row.frequency : version?.frequency ?? 'daily'
    const source = validSource(row.source) ? row.source : 'internal'
    return {
      id: string(row.id),
      equipmentId: string(row.equipment_id),
      formId: string(row.form_id),
      versionId: string(row.version_id),
      frequency,
      plannedOn: string(row.planned_on) || string(row.performed_on),
      scheduledOn: string(row.performed_on),
      taskResults: mapTaskResults(row.task_results, version?.items ?? []),
      note: nullable(row.note),
      operatorId: string(row.operator_id),
      operatorName: string(row.operator_name),
      operatorCode: string(row.operator_code),
      source,
      createdAt: string(row.created_at),
    } satisfies RoutineMaintenanceEntry
  })
}

async function formDefinition(formId: string) {
  const admin = getAdminClient()
  const { data: formData, error: formError } = await admin.from('bm_equipment_routine_forms').select('*').eq('id', formId).maybeSingle()
  fail(formError)
  if (!formData) throw new HttpError(404, 'ไม่พบฟอร์ม Routine Maintenance')
  const formRow = formData as Row
  const equipment = await equipmentById(string(formRow.equipment_id))
  const { data: versionData, error: versionError } = await admin
    .from('bm_equipment_routine_form_versions')
    .select('*')
    .eq('form_id', formId)
    .order('starts_on')
  fail(versionError)
  const versions = mapVersions((versionData ?? []) as Row[], await rowsFor('bm_equipment_routine_form_items', 'version_id', ((versionData ?? []) as Row[]).map((row) => string(row.id))))
  const { data: holidayData, error: holidayError } = await admin
    .from('bm_equipment_routine_holidays')
    .select('id,form_id,date,note')
    .eq('form_id', formId)
    .order('date')
  fail(holidayError)
  return {
    equipment,
    form: {
      id: string(formRow.id),
      equipmentId: string(formRow.equipment_id),
      name: string(formRow.name),
      active: Boolean(formRow.is_active),
      reviewerId: nullable(formRow.reviewer_id),
      versions,
    } satisfies RoutineMaintenanceForm,
    versions,
    holidays: ((holidayData ?? []) as Row[]).map((row) => ({
      id: string(row.id),
      formId: string(row.form_id),
      date: string(row.date),
      note: nullable(row.note),
    } satisfies RoutineMaintenanceHoliday)),
  }
}

export async function getRoutineWorkspace(actor: BmActor, equipmentId: string): Promise<RoutineMaintenanceWorkspace> {
  assertStaff(actor)
  const admin = getAdminClient()
  const [equipmentData, formData, userData] = await Promise.all([
    equipmentById(equipmentId),
    admin.from('bm_equipment_routine_forms').select('*').eq('equipment_id', equipmentId).order('name'),
    admin.from('nipt_users').select('id,display_name,is_active').order('display_name'),
  ])
  fail(formData.error)
  fail(userData.error)
  const formRows = (formData.data ?? []) as Row[]
  const formIds = formRows.map((row) => string(row.id))
  const versionRows = await rowsFor('bm_equipment_routine_form_versions', 'form_id', formIds)
  const versionIds = versionRows.map((row) => string(row.id))
  const [itemRows, entryResult, holidayRows, reviewResult] = await Promise.all([
    rowsFor('bm_equipment_routine_form_items', 'version_id', versionIds),
    admin.from('bm_equipment_routine_maintenance').select('*').eq('equipment_id', equipmentId).order('planned_on', { ascending: false }).limit(2000),
    rowsFor('bm_equipment_routine_holidays', 'form_id', formIds),
    admin.from('bm_equipment_routine_reviews').select('*').eq('equipment_id', equipmentId).order('reviewed_at', { ascending: false }).limit(2000),
  ])
  fail(entryResult.error)
  fail(reviewResult.error)
  const versions = mapVersions(versionRows, itemRows)
  const versionMap = new Map(versions.map((version) => [version.id, version]))
  const usersRows = (userData.data ?? []) as Row[]
  const names = new Map(usersRows.map((row) => [string(row.id), string(row.display_name)]))
  const forms = mapForms(formRows, versions)
  const reviews = ((reviewResult.data ?? []) as Row[]).map((row) => {
    const frequency = validFrequency(row.frequency) ? row.frequency : 'daily'
    return {
      id: string(row.id),
      formId: string(row.form_id),
      frequency,
      periodKind: routinePeriodKind(frequency),
      period: string(row.period),
      reviewedByName: names.get(string(row.reviewed_by)) ?? '-',
      reviewedAt: string(row.reviewed_at),
    } satisfies RoutineMaintenanceReview
  })
  return {
    equipment: {
      id: string(equipmentData.id),
      code: string(equipmentData.code),
      name: string(equipmentData.name),
      qrToken: string(equipmentData.qr_token),
    },
    forms,
    entries: mapEntries((entryResult.data ?? []) as Row[], versionMap),
    holidays: holidayRows.map((row) => ({ id: string(row.id), formId: string(row.form_id), date: string(row.date), note: nullable(row.note) })),
    reviews,
    users: usersRows.filter((row) => Boolean(row.is_active)).map((row) => ({ id: string(row.id), displayName: string(row.display_name) })),
    today: todayBangkok(),
  }
}

export async function getRoutineWorkspaceByToken(actor: BmActor, token: string) {
  assertStaff(actor)
  const equipment = await resolveRoutineEquipmentToken(token)
  if (!equipment) throw new HttpError(404, 'QR นี้ไม่พร้อมใช้งาน')
  return getRoutineWorkspace(actor, equipment.id)
}

export async function getRoutineReportCatalog(actor: BmActor): Promise<RoutineReportCatalog> {
  assertStaff(actor)
  const admin = getAdminClient()
  const [equipmentResult, formResult] = await Promise.all([
    admin.from('bm_equipment').select('id,code,name,status').order('code'),
    admin.from('bm_equipment_routine_forms').select('id,equipment_id,name,is_active').order('name'),
  ])
  fail(equipmentResult.error)
  fail(formResult.error)
  return {
    equipment: ((equipmentResult.data ?? []) as Row[]).map((row) => ({ id: string(row.id), code: string(row.code), name: string(row.name), status: string(row.status) })),
    forms: ((formResult.data ?? []) as Row[]).map((row) => ({ id: string(row.id), equipmentId: string(row.equipment_id), name: string(row.name), active: Boolean(row.is_active) })),
  }
}

async function assertReviewerExists(reviewerId: string | null | undefined) {
  if (!reviewerId) return
  const { data, error } = await getAdminClient().from('nipt_users').select('id,is_active').eq('id', reviewerId).maybeSingle()
  fail(error)
  if (!data || !Boolean((data as Row).is_active)) throw new HttpError(400, 'ผู้ตรวจสอบไม่ใช่ผู้ใช้ที่ใช้งานอยู่')
}

export async function createRoutineMaintenanceForm(input: RoutineMaintenanceFormInput, actor: BmActor) {
  assertAdmin(actor)
  ensureDate(input.startsOn, 'วันเริ่มต้น')
  if (!validFrequency(input.frequency)) throw new HttpError(400, 'รอบ Maintenance ไม่ถูกต้อง')
  const name = cleanFormName(input.name)
  const labels = cleanItems(input.items)
  const equipment = await equipmentById(input.equipmentId)
  if (string(equipment.status) === 'decommissioned') throw new HttpError(409, 'เครื่องมือถูกเลิกใช้งานแล้ว')
  await assertReviewerExists(input.reviewerId)
  const admin = getAdminClient()
  const { data: formData, error: formError } = await admin.from('bm_equipment_routine_forms').insert({
    equipment_id: input.equipmentId,
    name,
    reviewer_id: input.reviewerId ?? null,
    is_active: input.active ?? true,
    created_by: actor.id,
    updated_by: actor.id,
  }).select('id').single()
  if (isDuplicate(formError)) throw new HttpError(409, 'มีชื่อฟอร์มนี้ในเครื่องมือแล้ว')
  fail(formError)
  const formId = string((formData as Row).id)
  try {
    const { data: versionData, error: versionError } = await admin.from('bm_equipment_routine_form_versions').insert({
      form_id: formId,
      version_number: 1,
      frequency: input.frequency,
      starts_on: input.startsOn,
      created_by: actor.id,
    }).select('id').single()
    fail(versionError)
    const versionId = string((versionData as Row).id)
    const { error: itemError } = await admin.from('bm_equipment_routine_form_items').insert(labels.map((label, index) => ({ version_id: versionId, position: index + 1, label })))
    fail(itemError)
  } catch (error) {
    await admin.from('bm_equipment_routine_forms').delete().eq('id', formId)
    throw error
  }
  await writeAudit(actor, 'equipment.routine-maintenance.form.create', 'equipment-routine-form', formId, { equipmentId: input.equipmentId, name, frequency: input.frequency, startsOn: input.startsOn, itemCount: labels.length })
  return getRoutineWorkspace(actor, input.equipmentId)
}

export async function updateRoutineMaintenanceForm(input: RoutineMaintenanceFormUpdateInput, actor: BmActor) {
  assertAdmin(actor)
  ensureDate(input.startsOn, 'วันเริ่มต้น')
  if (!validFrequency(input.frequency)) throw new HttpError(400, 'รอบ Maintenance ไม่ถูกต้อง')
  const name = cleanFormName(input.name)
  const labels = cleanItems(input.items)
  const definition = await formDefinition(input.formId)
  await assertReviewerExists(input.reviewerId)
  const admin = getAdminClient()
  const [entryResult, reviewResult] = await Promise.all([
    admin.from('bm_equipment_routine_maintenance').select('id').eq('form_id', input.formId).limit(1),
    admin.from('bm_equipment_routine_reviews').select('id').eq('form_id', input.formId).limit(1),
  ])
  fail(entryResult.error)
  fail(reviewResult.error)
  const hasHistory = Boolean((entryResult.data ?? []).length || (reviewResult.data ?? []).length)
  const versions = [...definition.versions].sort((a, b) => b.versionNumber - a.versionNumber)
  const latest = versions[0]
  let startsOn = input.startsOn
  // Every edit creates a new version so the previous checklist remains
  // immutable, including when a reviewer already locked an empty period.
  if (hasHistory) {
    while (startsOn <= todayBangkok()) startsOn = addRoutineFrequency(startsOn, input.frequency)
  }
  if (latest && startsOn <= latest.startsOn) startsOn = addRoutineFrequency(latest.startsOn, input.frequency)
  while (definition.versions.some((version) => version.startsOn === startsOn)) startsOn = addRoutineFrequency(startsOn, input.frequency)

  const versionNumber = (latest?.versionNumber ?? 0) + 1
  let versionId = ''
  try {
    const { data: versionData, error: versionError } = await admin.from('bm_equipment_routine_form_versions').insert({ form_id: input.formId, version_number: versionNumber, frequency: input.frequency, starts_on: startsOn, created_by: actor.id }).select('id').single()
    if (isDuplicate(versionError)) throw new HttpError(409, 'ไม่สามารถสร้าง Version ในวันเริ่มต้นนี้ได้')
    fail(versionError)
    versionId = string((versionData as Row).id)
    const { error: itemError } = await admin.from('bm_equipment_routine_form_items').insert(labels.map((label, index) => ({ version_id: versionId, position: index + 1, label })))
    fail(itemError)
    const { error: formError } = await admin.from('bm_equipment_routine_forms').update({ name, reviewer_id: input.reviewerId ?? null, is_active: input.active ?? definition.form.active, updated_by: actor.id, updated_at: new Date().toISOString() }).eq('id', input.formId)
    if (isDuplicate(formError)) throw new HttpError(409, 'มีชื่อฟอร์มนี้ในเครื่องมือแล้ว')
    fail(formError)
  } catch (error) {
    if (versionId) await admin.from('bm_equipment_routine_form_versions').delete().eq('id', versionId)
    throw error
  }
  await writeAudit(actor, 'equipment.routine-maintenance.form.update', 'equipment-routine-form', input.formId, { name, frequency: input.frequency, startsOn, versionId, versionNumber, itemCount: labels.length })
  return getRoutineWorkspace(actor, definition.form.equipmentId)
}

export async function deactivateRoutineMaintenanceForm(formId: string, actor: BmActor) {
  assertAdmin(actor)
  const definition = await formDefinition(formId)
  const { error } = await getAdminClient().from('bm_equipment_routine_forms').update({ is_active: false, updated_by: actor.id, updated_at: new Date().toISOString() }).eq('id', formId)
  fail(error)
  await writeAudit(actor, 'equipment.routine-maintenance.form.deactivate', 'equipment-routine-form', formId, {})
  return getRoutineWorkspace(actor, definition.form.equipmentId)
}

async function assertUnlocked(formId: string, frequency: RoutineFrequency, date: string) {
  const period = routinePeriodFor(frequency, date)
  const { data, error } = await getAdminClient().from('bm_equipment_routine_reviews').select('id').eq('form_id', formId).eq('frequency', frequency).eq('period', period).maybeSingle()
  fail(error)
  if (data) throw new HttpError(409, 'งวดนี้ตรวจและล็อกแล้ว')
}

function snapshotResults(version: RoutineMaintenanceVersion, results: RoutineMaintenanceLogInput['taskResults']) {
  if (results.length !== version.items.length) throw new HttpError(400, 'จำนวนรายการ Checklist ไม่ถูกต้อง')
  const byId = new Map<string, { itemId: string; label?: string; state: RoutineTaskState }>()
  for (const result of results) {
    if (!result.itemId || byId.has(result.itemId) || !validState(result.state)) throw new HttpError(400, 'รายการ Checklist หรือสถานะไม่ถูกต้อง')
    byId.set(result.itemId, result)
  }
  return version.items.map((item) => {
    const result = byId.get(item.id)
    if (!result) throw new HttpError(400, 'รายการ Checklist ไม่ครบถ้วน')
    return { itemId: item.id, label: item.label, state: result.state } satisfies RoutineTaskResult
  })
}

export async function logRoutineMaintenance(input: RoutineMaintenanceLogInput, actor: BmActor) {
  assertStaff(actor)
  const source = input.source ?? 'internal'
  if (!validSource(source)) throw new HttpError(400, 'แหล่งที่มาของรายการไม่ถูกต้อง')
  if (source === 'qr' && !input.idempotencyKey) throw new HttpError(400, 'QR ต้องมี idempotency key')
  const admin = getAdminClient()
  if (input.idempotencyKey) {
    const { data: existing, error: existingError } = await admin.from('bm_equipment_routine_maintenance').select('id,form_id,equipment_id').eq('idempotency_key', input.idempotencyKey).maybeSingle()
    fail(existingError)
    if (existing) {
      if (string((existing as Row).form_id) !== input.formId) throw new HttpError(409, 'idempotency key นี้ถูกใช้ไปแล้ว')
      if (input.equipmentId && string((existing as Row).equipment_id) !== input.equipmentId) throw new HttpError(403, 'QR นี้ไม่ตรงกับเครื่องมือของฟอร์ม')
      return getRoutineWorkspace(actor, string((existing as Row).equipment_id))
    }
  }
  const definition = await formDefinition(input.formId)
  if (input.equipmentId && definition.form.equipmentId !== input.equipmentId) throw new HttpError(403, 'QR นี้ไม่ตรงกับเครื่องมือของฟอร์ม')
  if (!definition.form.active) throw new HttpError(409, 'ฟอร์มนี้ปิดใช้งานแล้ว')
  if (string(definition.equipment.status) === 'decommissioned') throw new HttpError(409, 'เครื่องมือถูกเลิกใช้งานแล้ว')
  const version = definition.versions.find((item) => item.id === input.versionId)
  if (!version) throw new HttpError(400, 'Version ของฟอร์มไม่ถูกต้อง')
  const nextVersion = definition.versions
    .filter((item) => item.startsOn > version.startsOn)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0]
  ensureDate(input.plannedOn, 'วันที่ตามรอบ')
  ensureDate(input.scheduledOn, 'วันที่เลื่อน')
  if (nextVersion && input.plannedOn >= nextVersion.startsOn) throw new HttpError(409, 'วันที่นี้ต้องบันทึกด้วย Version ล่าสุดของฟอร์ม')
  const occurrence = routineOccurrenceForPlannedDate(version, input.plannedOn, new Set(definition.holidays.map((holiday) => holiday.date)))
  if (!occurrence) throw new HttpError(400, 'วันที่นี้ไม่ตรงกับรอบของฟอร์ม')
  if (occurrence.scheduledOn !== input.scheduledOn) throw new HttpError(409, 'วันที่ทำงานไม่ตรงกับวันที่คำนวณจากรอบ')
  const today = todayBangkok()
  if (input.plannedOn > today || input.scheduledOn > today) throw new HttpError(400, 'เลือกวันในอนาคตไม่ได้')
  if (!actorCanBackfill(actor) && input.scheduledOn !== today) throw new HttpError(403, 'เฉพาะ Admin ที่บันทึกย้อนหลังได้')
  await assertUnlocked(input.formId, version.frequency, input.plannedOn)
  const taskResults = snapshotResults(version, input.taskResults)
  const { data, error } = await admin.from('bm_equipment_routine_maintenance').insert({
    equipment_id: definition.form.equipmentId,
    form_id: input.formId,
    version_id: version.id,
    frequency: version.frequency,
    planned_on: input.plannedOn,
    performed_on: input.scheduledOn,
    task_results: taskResults,
    note: input.note?.trim() || null,
    operator_id: actor.id,
    operator_name: actor.displayName,
    operator_code: reviewerCode(actor),
    source,
    idempotency_key: input.idempotencyKey ?? null,
  }).select('id').single()
  if (isDuplicate(error)) throw new HttpError(409, 'บันทึก Checklist ของรอบนี้แล้ว')
  fail(error)
  const id = string((data as Row).id)
  await writeAudit(actor, 'equipment.routine-maintenance.log', 'equipment-routine-maintenance', id, { formId: input.formId, versionId: version.id, frequency: version.frequency, plannedOn: input.plannedOn, scheduledOn: input.scheduledOn, source })
  return getRoutineWorkspace(actor, definition.form.equipmentId)
}

export async function setRoutineHoliday(formId: string, date: string, note: string | null | undefined, actor: BmActor) {
  assertAdmin(actor)
  ensureDate(date, 'วันหยุด')
  const definition = await formDefinition(formId)
  const { error } = await getAdminClient().from('bm_equipment_routine_holidays').upsert({ form_id: formId, date, note: note?.trim() || null, created_by: actor.id }, { onConflict: 'form_id,date' })
  fail(error)
  await writeAudit(actor, 'equipment.routine-maintenance.holiday.set', 'equipment-routine-holiday', `${formId}:${date}`, { note: note?.trim() || null })
  return getRoutineWorkspace(actor, definition.form.equipmentId)
}

export async function deleteRoutineHoliday(formId: string, date: string, actor: BmActor) {
  assertAdmin(actor)
  ensureDate(date, 'วันหยุด')
  const definition = await formDefinition(formId)
  const { error } = await getAdminClient().from('bm_equipment_routine_holidays').delete().eq('form_id', formId).eq('date', date)
  fail(error)
  await writeAudit(actor, 'equipment.routine-maintenance.holiday.delete', 'equipment-routine-holiday', `${formId}:${date}`, {})
  return getRoutineWorkspace(actor, definition.form.equipmentId)
}

export async function reviewRoutinePeriod(input: RoutineMaintenanceReviewInput, actor: BmActor) {
  assertStaff(actor)
  const definition = await formDefinition(input.formId)
  if (definition.form.reviewerId !== actor.id) throw new HttpError(403, 'คุณไม่ได้รับมอบหมายเป็นผู้ตรวจฟอร์มนี้')
  ensurePeriod(input.frequency, input.period)
  if (!definition.versions.some((version) => version.frequency === input.frequency)) throw new HttpError(400, 'รอบของฟอร์มไม่ถูกต้อง')
  if (input.period > routinePeriodFor(input.frequency, todayBangkok())) throw new HttpError(400, 'ล็อกงวดในอนาคตไม่ได้')
  const { error } = await getAdminClient().from('bm_equipment_routine_reviews').insert({ equipment_id: definition.form.equipmentId, form_id: input.formId, frequency: input.frequency, period: input.period, reviewed_by: actor.id })
  if (isDuplicate(error)) throw new HttpError(409, 'งวดนี้ล็อกแล้ว')
  fail(error)
  await writeAudit(actor, 'equipment.routine-maintenance.review.lock', 'equipment-routine-review', `${input.formId}:${input.frequency}:${input.period}`, {})
  return getRoutineWorkspace(actor, definition.form.equipmentId)
}

export async function unlockRoutinePeriod(input: RoutineMaintenanceReviewInput, actor: BmActor) {
  assertAdmin(actor)
  const definition = await formDefinition(input.formId)
  ensurePeriod(input.frequency, input.period)
  const { error } = await getAdminClient().from('bm_equipment_routine_reviews').delete().eq('form_id', input.formId).eq('frequency', input.frequency).eq('period', input.period)
  fail(error)
  await writeAudit(actor, 'equipment.routine-maintenance.review.unlock', 'equipment-routine-review', `${input.formId}:${input.frequency}:${input.period}`, {})
  return getRoutineWorkspace(actor, definition.form.equipmentId)
}

export async function deleteRoutineMaintenanceEntry(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data, error } = await admin.from('bm_equipment_routine_maintenance').select('equipment_id,form_id,frequency,planned_on').eq('id', id).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบรายการ Maintenance')
  const row = data as Row
  const frequency = string(row.frequency)
  if (!validFrequency(frequency)) throw new HttpError(400, 'รอบ Maintenance ในประวัติไม่ถูกต้อง')
  await assertUnlocked(string(row.form_id), frequency, string(row.planned_on))
  const { error: deleteError } = await admin.from('bm_equipment_routine_maintenance').delete().eq('id', id)
  fail(deleteError)
  await writeAudit(actor, 'equipment.routine-maintenance.entry.delete', 'equipment-routine-maintenance', id, { formId: row.form_id, plannedOn: row.planned_on })
  return getRoutineWorkspace(actor, string(row.equipment_id))
}

export function dueVersion(form: RoutineMaintenanceForm, today = todayBangkok()) {
  return currentRoutineVersion(form, today)
}
