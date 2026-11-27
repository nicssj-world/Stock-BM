import 'server-only'

import { randomBytes } from 'node:crypto'
import type { BmActor, BmRole } from '@/lib/bm/types'
import { todayBangkok } from '@/lib/bm/rules'
import {
  addDays,
  buildDigestFlex,
  buildDigestMessage,
  buildIcsFeed,
  covers,
  DAY_PART_LABEL,
  entryPermissionError,
  GOOGLE_TH_HOLIDAY_ICS,
  isWeekend,
  normalizeTypeName,
  parseGoogleHolidayIcs,
  shouldSendDigest,
  thaiRange,
  digestTargetDays,
  type DigestDay,
  type FeedEvent,
} from '@/lib/calendar/rules'
import {
  CALENDAR_COLORS,
  CALENDAR_KINDS,
  DAY_PARTS,
  type CalendarBook,
  type CalendarColor,
  type CalendarEvent,
  type CalendarHistoryEntry,
  type CalendarHoliday,
  type CalendarKind,
  type CalendarTodaySummary,
  type CalendarType,
  type CalendarUser,
  type CalendarWorkspace,
  type DayPart,
} from '@/lib/calendar/types'
import { writeAudit, writeSystemAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

const EVENT_ENTITY = 'calendar-event'

function fail(error: { message: string; code?: string } | null, fallback = 'Calendar database operation failed') {
  if (!error) return
  if (error.code === '23505') throw new HttpError(409, 'มีข้อมูลนี้อยู่แล้ว')
  throw new HttpError(400, error.message || fallback)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function asRole(value: unknown): BmRole {
  const role = asString(value)
  if (role === 'Admin' || role === 'Assistant' || role === 'Signer') return role
  return 'Staff'
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'ต้องเป็น Admin')
}

/* ---------- users ---------- */

type LoadedUsers = { active: CalendarUser[]; nameById: Map<string, string> }

async function loadUsers(): Promise<LoadedUsers> {
  const admin = getAdminClient()
  const [{ data: profiles, error: profileError }, { data: access, error: accessError }] = await Promise.all([
    admin.from('nipt_users').select('id,display_name,is_active').order('display_name'),
    admin.from('bm_user_access').select('user_id,role,is_active'),
  ])
  fail(profileError)
  fail(accessError)
  const accessById = new Map(((access ?? []) as RecordRow[]).map((row) => [asString(row.user_id), row]))
  const nameById = new Map<string, string>()
  const active: CalendarUser[] = []
  for (const row of (profiles ?? []) as RecordRow[]) {
    const id = asString(row.id)
    const displayName = asString(row.display_name)
    nameById.set(id, displayName)
    const grant = accessById.get(id)
    const role = asRole(grant?.role)
    if (row.is_active === true && grant?.is_active === true && (role === 'Admin' || role === 'Staff')) active.push({ id, displayName })
  }
  return { active, nameById }
}

/* ---------- mapping ---------- */

function mapCalendar(row: RecordRow, withSecrets: boolean): CalendarBook {
  return {
    id: asString(row.id),
    name: asString(row.name),
    colorKey: pick(row.color_key, CALENDAR_COLORS, 'teal'),
    lineGroupId: withSecrets ? nullableString(row.line_group_id) : null,
    isDefault: row.is_default === true,
    isActive: row.is_active === true,
    sortOrder: Number(row.sort_order ?? 100),
  }
}

function mapType(row: RecordRow, usage: Map<string, number>): CalendarType {
  const id = asString(row.id)
  return {
    id,
    calendarId: asString(row.calendar_id),
    name: asString(row.name),
    iconKey: asString(row.icon_key),
    colorKey: pick(row.color_key, CALENDAR_COLORS, 'slate'),
    kind: pick(row.kind, CALENDAR_KINDS, 'other'),
    inLineDigest: row.in_line_digest === true,
    requiresTitle: row.requires_title === true,
    sortOrder: Number(row.sort_order ?? 100),
    isActive: row.is_active === true,
    usageCount: usage.get(id) ?? 0,
  }
}

function mapEvent(row: RecordRow, users: LoadedUsers): CalendarEvent {
  const userId = asString(row.user_id)
  return {
    id: asString(row.id),
    calendarId: asString(row.calendar_id),
    typeId: asString(row.type_id),
    userId,
    userName: users.nameById.get(userId) ?? 'ไม่พบผู้ใช้',
    startDate: asString(row.start_date),
    endDate: asString(row.end_date),
    dayPart: pick(row.day_part, DAY_PARTS, 'full'),
    title: nullableString(row.title),
    note: nullableString(row.note),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

function mapHoliday(row: RecordRow): CalendarHoliday {
  return {
    id: asString(row.id),
    date: asString(row.holiday_date),
    name: asString(row.name),
    source: row.source === 'manual' ? 'manual' : 'google',
    isDayOff: row.is_day_off === true,
    isObservance: row.is_observance === true,
  }
}

/* ---------- reads ---------- */

/* ---------- calendars ---------- */

async function loadCalendarRows() {
  const { data, error } = await getAdminClient().from('bm_calendars').select('*').order('sort_order').order('name')
  fail(error)
  return (data ?? []) as RecordRow[]
}

async function loadCalendars(withSecrets = false): Promise<CalendarBook[]> {
  return (await loadCalendarRows()).map((row) => mapCalendar(row, withSecrets))
}

/** The requested calendar if it exists (and is open, unless inactive ones are allowed); otherwise the default one. */
function resolveCalendar(calendars: CalendarBook[], id: string | null | undefined, allowInactive = false) {
  const wanted = id ? calendars.find((calendar) => calendar.id === id && (allowInactive || calendar.isActive)) : undefined
  const found = wanted ?? calendars.find((calendar) => calendar.isDefault) ?? calendars.find((calendar) => calendar.isActive)
  if (!found) throw new HttpError(500, 'ไม่พบปฏิทินหลัก ตรวจว่าได้ apply migration 202611260001_calendar_multi.sql แล้ว')
  return found
}

async function defaultCalendar() {
  return resolveCalendar(await loadCalendars(true), null)
}

async function requireCalendar(id: string) {
  const { data, error } = await getAdminClient().from('bm_calendars').select('*').eq('id', id).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบปฏิทินนี้')
  return mapCalendar(data as RecordRow, true)
}

async function loadTypes(calendarId?: string, forButtons = false): Promise<CalendarType[]> {
  const admin = getAdminClient()
  let typeQuery = admin.from('bm_calendar_types').select('*')
  if (forButtons) typeQuery = typeQuery.order('button_sort_order', { ascending: true, nullsFirst: false })
  typeQuery = typeQuery.order('sort_order').order('name').order('id')
  let usageQuery = admin.from('bm_calendar_events').select('type_id')
  if (calendarId) {
    typeQuery = typeQuery.eq('calendar_id', calendarId)
    usageQuery = usageQuery.eq('calendar_id', calendarId)
  }
  const [{ data, error }, { data: usageRows, error: usageError }] = await Promise.all([typeQuery, usageQuery])
  fail(error)
  fail(usageError)
  const usage = new Map<string, number>()
  for (const row of (usageRows ?? []) as RecordRow[]) usage.set(asString(row.type_id), (usage.get(asString(row.type_id)) ?? 0) + 1)
  return ((data ?? []) as RecordRow[]).map((row) => mapType(row, usage))
}

async function loadEvents(from: string, to: string, users: LoadedUsers, scope: { calendarId?: string; userId?: string } = {}) {
  const { calendarId, userId } = scope
  let query = getAdminClient()
    .from('bm_calendar_events')
    .select('*')
    .is('deleted_at', null)
    .lte('start_date', to)
    .gte('end_date', from)
    .order('start_date')
  if (calendarId) query = query.eq('calendar_id', calendarId)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  fail(error)
  return ((data ?? []) as RecordRow[]).map((row) => mapEvent(row, users))
}

async function loadHolidays(from: string, to: string) {
  const { data, error } = await getAdminClient()
    .from('bm_calendar_holidays')
    .select('*')
    .gte('holiday_date', from)
    .lte('holiday_date', to)
    .order('holiday_date')
  fail(error)
  return ((data ?? []) as RecordRow[]).map(mapHoliday)
}

export async function getCalendarWorkspace(from: string, to: string, actor: BmActor, calendarId?: string | null): Promise<CalendarWorkspace> {
  if (to < from || to > addDays(from, 62)) throw new HttpError(400, 'ช่วงวันที่ไม่ถูกต้อง')
  const isAdmin = actor.role === 'Admin'
  const [users, allCalendars] = await Promise.all([loadUsers(), loadCalendars(isAdmin)])
  const calendars = isAdmin ? allCalendars : allCalendars.filter((calendar) => calendar.isActive)
  const calendar = resolveCalendar(calendars, calendarId, isAdmin)
  const [types, events, holidays, settings] = await Promise.all([
    loadTypes(calendar.id, true),
    loadEvents(from, to, users, { calendarId: calendar.id }),
    loadHolidays(from, to),
    getAdminClient().from('bm_calendar_settings').select('holidays_synced_at,holidays_sync_error').eq('id', true).maybeSingle(),
  ])
  fail(settings.error)
  const settingsRow = settings.data as RecordRow | null
  return {
    from,
    to,
    calendarId: calendar.id,
    calendars,
    today: todayBangkok(),
    types,
    events,
    holidays,
    users: users.active,
    holidaysSyncedAt: nullableString(settingsRow?.holidays_synced_at),
    holidaysSyncError: nullableString(settingsRow?.holidays_sync_error),
  }
}

/* ---------- entries ---------- */

export interface EntryInput {
  typeId: string
  userId: string
  startDate: string
  endDate: string
  dayPart: DayPart
  title: string | null
  note: string | null
}

async function requireType(typeId: string, allowInactive = false) {
  const { data, error } = await getAdminClient().from('bm_calendar_types').select('id,name,is_active,requires_title,calendar_id').eq('id', typeId).maybeSingle()
  fail(error)
  const row = data as RecordRow | null
  if (!row) throw new HttpError(404, 'ไม่พบประเภทนี้')
  if (!allowInactive && row.is_active !== true) throw new HttpError(400, 'ประเภทนี้ถูกปิดใช้งานแล้ว')
  const calendar = await requireCalendar(asString(row.calendar_id))
  if (!calendar.isActive) throw new HttpError(400, `ปฏิทิน “${calendar.name}” ถูกปิดใช้งานแล้ว`)
  return { name: asString(row.name), requiresTitle: row.requires_title === true, calendarId: calendar.id }
}

/** Only types that ask for a title keep one; it is mandatory for them. */
function entryTitle(input: EntryInput, type: { name: string; requiresTitle: boolean }) {
  if (!type.requiresTitle) return null
  if (!input.title) throw new HttpError(400, `${type.name} ต้องใส่หัวข้อ`)
  return input.title
}

function validateEntry(input: EntryInput) {
  if (input.endDate < input.startDate) throw new HttpError(400, 'วันที่สิ้นสุดต้องไม่ก่อนวันเริ่ม')
  if (input.dayPart !== 'full' && input.startDate !== input.endDate) throw new HttpError(400, 'ลาครึ่งวันได้ทีละวันเดียว')
  if (addDays(input.startDate, 366) < input.endDate) throw new HttpError(400, 'ลงได้ไม่เกิน 1 ปีต่อรายการ')
}

async function loadEventRow(id: string) {
  const { data, error } = await getAdminClient().from('bm_calendar_events').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  fail(error)
  const row = data as RecordRow | null
  if (!row) throw new HttpError(404, 'ไม่พบรายการนี้ อาจถูกลบไปแล้ว')
  return row
}

function snapshot(row: RecordRow) {
  return {
    calendarId: asString(row.calendar_id),
    typeId: asString(row.type_id),
    userId: asString(row.user_id),
    startDate: asString(row.start_date),
    endDate: asString(row.end_date),
    dayPart: asString(row.day_part),
    title: nullableString(row.title),
    note: nullableString(row.note),
  }
}

export async function createCalendarEntry(input: EntryInput, actor: BmActor) {
  validateEntry(input)
  const today = todayBangkok()
  const denied = entryPermissionError(actor, input, today)
  if (denied) throw new HttpError(403, denied)
  const type = await requireType(input.typeId)
  const title = entryTitle(input, type)
  const users = await loadUsers()
  if (!users.active.some((user) => user.id === input.userId)) throw new HttpError(400, 'ไม่พบผู้ใช้นี้ในทีม')
  const row = {
    calendar_id: type.calendarId,
    type_id: input.typeId,
    user_id: input.userId,
    start_date: input.startDate,
    end_date: input.endDate,
    day_part: input.dayPart,
    title,
    note: input.note,
    created_by: actor.id,
    updated_by: actor.id,
  }
  const { data, error } = await getAdminClient().from('bm_calendar_events').insert(row).select('*').single()
  fail(error)
  const created = data as RecordRow
  await writeAudit(actor, 'calendar.create', EVENT_ENTITY, asString(created.id), { after: snapshot(row) })
  return mapEvent(created, users)
}

export async function updateCalendarEntry(id: string, input: EntryInput, actor: BmActor) {
  validateEntry(input)
  const today = todayBangkok()
  const current = await loadEventRow(id)
  const before = snapshot(current)
  const deniedBefore = entryPermissionError(actor, { userId: before.userId, endDate: before.endDate }, today)
  if (deniedBefore) throw new HttpError(403, deniedBefore)
  const deniedAfter = entryPermissionError(actor, input, today)
  if (deniedAfter) throw new HttpError(403, deniedAfter)
  const type = await requireType(input.typeId, input.typeId === before.typeId)
  if (type.calendarId !== before.calendarId) throw new HttpError(400, 'ย้ายรายการไปปฏิทินอื่นไม่ได้ ลบแล้วลงใหม่ในปฏิทินนั้นแทน')
  const title = entryTitle(input, type)
  const users = await loadUsers()
  if (input.userId !== before.userId && !users.active.some((user) => user.id === input.userId)) throw new HttpError(400, 'ไม่พบผู้ใช้นี้ในทีม')
  const after = { calendarId: before.calendarId, typeId: input.typeId, userId: input.userId, startDate: input.startDate, endDate: input.endDate, dayPart: input.dayPart, title, note: input.note }
  const { data, error } = await getAdminClient()
    .from('bm_calendar_events')
    .update({
      type_id: after.typeId,
      user_id: after.userId,
      start_date: after.startDate,
      end_date: after.endDate,
      day_part: after.dayPart,
      title: after.title,
      note: after.note,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)
    .eq('updated_at', asString(current.updated_at))
    .select('*')
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(409, 'รายการนี้เพิ่งถูกแก้โดยคนอื่น โหลดหน้าใหม่แล้วลองอีกครั้ง')
  await writeAudit(actor, 'calendar.update', EVENT_ENTITY, id, { before, after })
  return mapEvent(data as RecordRow, users)
}

export async function deleteCalendarEntry(id: string, actor: BmActor) {
  const current = await loadEventRow(id)
  const before = snapshot(current)
  const denied = entryPermissionError(actor, { userId: before.userId, endDate: before.endDate }, todayBangkok())
  if (denied) throw new HttpError(403, denied)
  const now = new Date().toISOString()
  const { data, error } = await getAdminClient()
    .from('bm_calendar_events')
    .update({ deleted_at: now, deleted_by: actor.id, updated_at: now })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบรายการนี้ อาจถูกลบไปแล้ว')
  await writeAudit(actor, 'calendar.delete', EVENT_ENTITY, id, { before })
  return { id }
}

/** Undo for a delete made moments ago (the toast's "เลิกทำ"). */
export async function restoreCalendarEntry(id: string, actor: BmActor) {
  const { data, error } = await getAdminClient().from('bm_calendar_events').select('*').eq('id', id).maybeSingle()
  fail(error)
  const row = data as RecordRow | null
  if (!row || !row.deleted_at) throw new HttpError(404, 'ไม่พบรายการที่ลบ')
  const denied = entryPermissionError(actor, { userId: asString(row.user_id), endDate: asString(row.end_date) }, todayBangkok())
  if (denied) throw new HttpError(403, denied)
  if (actor.role !== 'Admin' && asString(row.deleted_by) !== actor.id) throw new HttpError(403, 'กู้คืนได้เฉพาะรายการที่ตัวเองลบ')
  const { data: restored, error: restoreError } = await getAdminClient()
    .from('bm_calendar_events')
    .update({ deleted_at: null, deleted_by: null, updated_by: actor.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  fail(restoreError)
  await writeAudit(actor, 'calendar.restore', EVENT_ENTITY, id, { after: snapshot(row) })
  return mapEvent(restored as RecordRow, await loadUsers())
}

export async function getCalendarEntryHistory(id: string): Promise<CalendarHistoryEntry[]> {
  const admin = getAdminClient()
  const [{ data, error }, users, types] = await Promise.all([
    admin.from('bm_audit_logs').select('actor_id,action,detail,created_at').eq('entity_type', EVENT_ENTITY).eq('entity_id', id).order('created_at'),
    loadUsers(),
    loadTypes(),
  ])
  fail(error)
  const typeName = (typeId: unknown) => types.find((type) => type.id === typeId)?.name ?? 'ประเภทที่ถูกลบ'
  const userName = (userId: unknown) => users.nameById.get(asString(userId)) ?? 'ไม่พบผู้ใช้'
  return ((data ?? []) as RecordRow[]).map((row) => {
    const action = asString(row.action)
    const detail = (row.detail ?? {}) as { before?: RecordRow; after?: RecordRow }
    const changes: string[] = []
    if (action === 'calendar.update' && detail.before && detail.after) {
      const b = detail.before
      const a = detail.after
      if (b.typeId !== a.typeId) changes.push(`ประเภท ${typeName(b.typeId)} → ${typeName(a.typeId)}`)
      if (b.userId !== a.userId) changes.push(`คน ${userName(b.userId)} → ${userName(a.userId)}`)
      if (b.startDate !== a.startDate || b.endDate !== a.endDate) {
        changes.push(`วันที่ ${thaiRange(asString(b.startDate), asString(b.endDate))} → ${thaiRange(asString(a.startDate), asString(a.endDate))}`)
      }
      if (b.dayPart !== a.dayPart) changes.push(`ช่วง ${DAY_PART_LABEL[pick(b.dayPart, DAY_PARTS, 'full')]} → ${DAY_PART_LABEL[pick(a.dayPart, DAY_PARTS, 'full')]}`)
      if ((b.title ?? null) !== (a.title ?? null)) changes.push(a.title ? `หัวข้อ “${asString(a.title)}”` : 'ลบหัวข้อ')
      if ((b.note ?? null) !== (a.note ?? null)) changes.push('หมายเหตุ')
    }
    return {
      at: asString(row.created_at),
      actorName: users.nameById.get(asString(row.actor_id)) ?? 'ระบบ',
      action: action === 'calendar.create' || action === 'calendar.restore' ? 'create' : action === 'calendar.delete' ? 'delete' : 'update',
      changes,
    }
  })
}

/* ---------- types (Admin) ---------- */

export interface TypeInput {
  name: string
  iconKey: string
  colorKey: CalendarColor
  kind: CalendarKind
  inLineDigest: boolean
  requiresTitle: boolean
  isActive: boolean
}

async function assertUniqueTypeName(name: string, calendarId: string, exceptId?: string) {
  const { data, error } = await getAdminClient().from('bm_calendar_types').select('id,name').eq('calendar_id', calendarId)
  fail(error)
  const clash = ((data ?? []) as RecordRow[]).find((row) => asString(row.id) !== exceptId && normalizeTypeName(asString(row.name)) === normalizeTypeName(name))
  if (clash) throw new HttpError(409, `มีประเภท “${asString(clash.name)}” อยู่แล้ว`)
}

export async function createCalendarType(input: TypeInput & { calendarId?: string }, actor: BmActor) {
  assertAdmin(actor)
  if (!input.calendarId) throw new HttpError(400, 'เลือกปฏิทิน')
  const calendar = await requireCalendar(input.calendarId)
  const name = input.name.trim()
  await assertUniqueTypeName(name, calendar.id)
  const types = await loadTypes(calendar.id)
  const sortOrder = Math.max(0, ...types.map((type) => type.sortOrder)) + 10
  const { data, error } = await getAdminClient()
    .from('bm_calendar_types')
    .insert({
      calendar_id: calendar.id,
      name,
      icon_key: input.iconKey,
      color_key: input.colorKey,
      kind: input.kind,
      in_line_digest: input.inLineDigest,
      requires_title: input.requiresTitle,
      is_active: input.isActive,
      sort_order: sortOrder,
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'calendar.type_create', 'calendar-type', asString((data as RecordRow).id), { ...input, calendarId: calendar.id, name })
  return loadTypes(calendar.id, true)
}

/** A type never moves to another calendar; a calendarId in the input is ignored. */
export async function updateCalendarType(id: string, { calendarId: _ignored, ...input }: TypeInput & { calendarId?: string }, actor: BmActor) {
  void _ignored
  assertAdmin(actor)
  const name = input.name.trim()
  const { data: current, error: currentError } = await getAdminClient().from('bm_calendar_types').select('calendar_id').eq('id', id).maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'ไม่พบประเภทนี้')
  const calendarId = asString((current as RecordRow).calendar_id)
  await assertUniqueTypeName(name, calendarId, id)
  const { data, error } = await getAdminClient()
    .from('bm_calendar_types')
    .update({
      name,
      icon_key: input.iconKey,
      color_key: input.colorKey,
      kind: input.kind,
      in_line_digest: input.inLineDigest,
      requires_title: input.requiresTitle,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบประเภทนี้')
  await writeAudit(actor, 'calendar.type_update', 'calendar-type', id, { ...input, name })
  return loadTypes(calendarId, true)
}

/** Permanently remove only an unused type, including checks for soft-deleted entries. */
export async function deleteCalendarType(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: current, error: currentError } = await admin.from('bm_calendar_types').select('calendar_id,name').eq('id', id).maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'ไม่พบประเภทนี้')
  const calendarId = asString((current as RecordRow).calendar_id)

  async function assertUnused() {
    const { count, error } = await admin.from('bm_calendar_events').select('id', { count: 'exact', head: true }).eq('type_id', id)
    fail(error)
    if (count === null) throw new HttpError(500, 'ตรวจสอบรายการที่เกี่ยวข้องไม่สำเร็จ')
    if (count > 0) throw new HttpError(409, `ประเภทนี้มีรายการที่เกี่ยวข้อง ${count} รายการ ไม่สามารถลบได้ กรุณาปิดใช้งานแทน`)
  }

  await assertUnused()
  const { data, error } = await admin.from('bm_calendar_types').delete().eq('id', id).eq('calendar_id', calendarId).select('id').maybeSingle()
  // The existing RESTRICT foreign keys also protect against a concurrent entry creation.
  if (error?.code === '23503') {
    await assertUnused()
    throw new HttpError(409, 'ประเภทนี้มีรายการที่เกี่ยวข้อง ไม่สามารถลบได้ กรุณาปิดใช้งานแทน')
  }
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบประเภทนี้')
  await writeAudit(actor, 'calendar.type_delete', 'calendar-type', id, { calendarId, name: asString((current as RecordRow).name) })
  return loadTypes(calendarId, true)
}

/** Persist button order independently from the event display order. */
export async function reorderCalendarTypeButtons(input: { calendarId: string; ids: string[]; expectedIds: string[] }, actor: BmActor) {
  assertAdmin(actor)
  const { error } = await getAdminClient().rpc('bm_reorder_calendar_type_buttons', {
    p_calendar_id: input.calendarId,
    p_ids: input.ids,
    p_expected_ids: input.expectedIds,
  })
  if (error?.code === '40001') throw new HttpError(409, 'ลำดับหรือประเภทรายการมีการเปลี่ยนแปลง กรุณาปิดและเปิดหน้าประเภทใหม่ก่อนจัดลำดับอีกครั้ง')
  if (error?.code === '22023') throw new HttpError(400, 'รายการประเภทไม่ถูกต้อง')
  fail(error)
  return loadTypes(input.calendarId, true)
}

/* ---------- calendars (Admin) ---------- */

export interface CalendarInput {
  name: string
  colorKey: CalendarColor
  lineGroupId: string | null
  isActive: boolean
}

async function assertUniqueCalendarName(name: string, exceptId?: string) {
  const clash = (await loadCalendarRows()).find((row) => asString(row.id) !== exceptId && normalizeTypeName(asString(row.name)) === normalizeTypeName(name))
  if (clash) throw new HttpError(409, `มีปฏิทิน “${asString(clash.name)}” อยู่แล้ว`)
}

function calendarAudit(input: CalendarInput, name: string) {
  return { name, colorKey: input.colorKey, isActive: input.isActive, hasLineGroup: Boolean(input.lineGroupId) }
}

export async function createCalendar(input: CalendarInput, actor: BmActor) {
  assertAdmin(actor)
  const name = input.name.trim()
  await assertUniqueCalendarName(name)
  const calendars = await loadCalendars()
  const sortOrder = Math.max(0, ...calendars.map((calendar) => calendar.sortOrder)) + 10
  const { data, error } = await getAdminClient()
    .from('bm_calendars')
    .insert({ name, color_key: input.colorKey, line_group_id: input.lineGroupId, is_active: input.isActive, sort_order: sortOrder, created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  const id = asString((data as RecordRow).id)
  await writeAudit(actor, 'calendar.book_create', 'calendar', id, calendarAudit(input, name))
  return { id, calendars: await loadCalendars(true) }
}

export async function updateCalendar(id: string, input: CalendarInput, actor: BmActor) {
  assertAdmin(actor)
  const current = await requireCalendar(id)
  if (current.isDefault && !input.isActive) throw new HttpError(400, 'ปิดปฏิทินหลักไม่ได้')
  const name = input.name.trim()
  await assertUniqueCalendarName(name, id)
  const { error } = await getAdminClient()
    .from('bm_calendars')
    .update({ name, color_key: input.colorKey, line_group_id: input.lineGroupId, is_active: input.isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
  fail(error)
  await writeAudit(actor, 'calendar.book_update', 'calendar', id, calendarAudit(input, name))
  return { id, calendars: await loadCalendars(true) }
}

/* ---------- holidays ---------- */

export async function listHolidaysForAdmin(actor: BmActor) {
  assertAdmin(actor)
  const today = todayBangkok()
  return loadHolidays(addDays(today, -60), addDays(today, 400))
}

export async function setHolidayDayOff(id: string, isDayOff: boolean, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient()
    .from('bm_calendar_holidays')
    .update({ is_day_off: isDayOff, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,name,holiday_date')
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบวันหยุดนี้')
  await writeAudit(actor, 'calendar.holiday_day_off', 'calendar-holiday', id, { isDayOff })
  return listHolidaysForAdmin(actor)
}

export async function addManualHoliday(date: string, name: string, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient()
    .from('bm_calendar_holidays')
    .insert({ holiday_date: date, name: name.trim(), source: 'manual', is_day_off: true, created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'calendar.holiday_add', 'calendar-holiday', asString((data as RecordRow).id), { date, name })
  return listHolidaysForAdmin(actor)
}

export async function deleteManualHoliday(id: string, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('bm_calendar_holidays').delete().eq('id', id).eq('source', 'manual').select('id,holiday_date,name').maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ลบได้เฉพาะวันหยุดที่เพิ่มเอง')
  await writeAudit(actor, 'calendar.holiday_delete', 'calendar-holiday', id, { date: asString((data as RecordRow).holiday_date), name: asString((data as RecordRow).name) })
  return listHolidaysForAdmin(actor)
}

/**
 * Pulls Google's public Thai holiday calendar. New rows get is_day_off from Google's
 * own label; existing rows keep the Admin's day-off choice and only refresh name/date.
 */
export async function syncGoogleHolidays(actor: BmActor | null) {
  const admin = getAdminClient()
  const today = todayBangkok()
  const range = { from: addDays(today, -400), to: addDays(today, 800) }
  let parsed
  try {
    const response = await fetch(GOOGLE_TH_HOLIDAY_ICS, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`Google ตอบกลับ ${response.status}`)
    parsed = parseGoogleHolidayIcs(await response.text(), range)
    if (!parsed.length) throw new Error('ไม่พบวันหยุดในไฟล์จาก Google')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ดึงข้อมูลจาก Google ไม่สำเร็จ'
    await admin.from('bm_calendar_settings').update({ holidays_sync_error: message, updated_at: new Date().toISOString() }).eq('id', true)
    throw new HttpError(502, `ซิงค์วันหยุดไม่สำเร็จ: ${message}`)
  }

  const { data: existingRows, error } = await admin.from('bm_calendar_holidays').select('source_uid').eq('source', 'google')
  fail(error)
  const existing = new Set(((existingRows ?? []) as RecordRow[]).map((row) => asString(row.source_uid)))
  const fresh = parsed.filter((holiday) => !existing.has(holiday.uid))
  const known = parsed.filter((holiday) => existing.has(holiday.uid))
  const now = new Date().toISOString()

  if (fresh.length) {
    const { error: insertError } = await admin.from('bm_calendar_holidays').upsert(
      fresh.map((holiday) => ({
        holiday_date: holiday.date,
        name: holiday.name,
        source: 'google',
        source_uid: holiday.uid,
        is_day_off: !holiday.isObservance,
        is_observance: holiday.isObservance,
      })),
      { onConflict: 'holiday_date,name', ignoreDuplicates: true },
    )
    fail(insertError)
  }
  for (const holiday of known) {
    const { error: updateError } = await admin
      .from('bm_calendar_holidays')
      .update({ holiday_date: holiday.date, name: holiday.name, is_observance: holiday.isObservance, updated_at: now })
      .eq('source_uid', holiday.uid)
    fail(updateError)
  }
  await admin.from('bm_calendar_settings').update({ holidays_synced_at: now, holidays_sync_error: null, updated_at: now }).eq('id', true)
  const detail = { added: fresh.length, refreshed: known.length }
  if (actor) await writeAudit(actor, 'calendar.holiday_sync', 'calendar-holiday', undefined, detail)
  else await writeSystemAudit('calendar.holiday_sync', 'calendar-holiday', undefined, detail)
  return detail
}

/* ---------- today summary (dashboard card) ---------- */

export async function getCalendarTodaySummary(): Promise<CalendarTodaySummary> {
  const today = todayBangkok()
  const [users, calendar] = await Promise.all([loadUsers(), defaultCalendar()])
  const [types, events, holidays] = await Promise.all([
    loadTypes(calendar.id),
    loadEvents(today, today, users, { calendarId: calendar.id }),
    loadHolidays(today, today),
  ])
  const typeById = new Map(types.map((type) => [type.id, type]))
  const holiday = holidays.find((item) => item.isDayOff) ?? null
  const duty = new Map<string, CalendarTodaySummary['duty'][number]>()
  const away: CalendarTodaySummary['away'] = []
  const absent = new Set<string>()
  for (const event of events) {
    const type = typeById.get(event.typeId)
    if (!type) continue
    if (type.kind === 'duty') {
      const group = duty.get(type.id) ?? { typeName: type.name, iconKey: type.iconKey, colorKey: type.colorKey, people: [] }
      group.people.push(event.userName)
      duty.set(type.id, group)
    } else if (type.kind === 'leave') {
      away.push({ name: event.userName, typeName: type.name, iconKey: type.iconKey, colorKey: type.colorKey, dayPart: event.dayPart })
      if (event.dayPart === 'full') absent.add(event.userId)
    }
  }
  const activeIds = new Set(users.active.map((user) => user.id))
  return {
    date: today,
    holidayName: holiday?.name ?? null,
    isWeekend: isWeekend(today),
    duty: [...duty.values()],
    away,
    presentCount: [...activeIds].filter((id) => !absent.has(id)).length,
    staffCount: activeIds.size,
  }
}

/* ---------- personal ICS feed ---------- */

function newToken() {
  return randomBytes(24).toString('base64url')
}

export async function getFeedToken(actor: BmActor, rotate = false) {
  const admin = getAdminClient()
  if (!rotate) {
    const { data, error } = await admin.from('bm_calendar_feed_tokens').select('token').eq('user_id', actor.id).maybeSingle()
    fail(error)
    const token = asString((data as RecordRow | null)?.token)
    if (token) return token
  }
  const token = newToken()
  const { error } = await admin.from('bm_calendar_feed_tokens').upsert({ user_id: actor.id, token, created_at: new Date().toISOString() }, { onConflict: 'user_id' })
  fail(error)
  if (rotate) await writeAudit(actor, 'calendar.feed_rotate', 'calendar-feed', undefined, {})
  return token
}

/** Builds the ICS body for a feed token, or null when the token is unknown or its owner lost access. */
export async function buildFeedForToken(token: string, scope: 'mine' | 'team', calendarId?: string | null) {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return null
  const admin = getAdminClient()
  const { data, error } = await admin.from('bm_calendar_feed_tokens').select('user_id').eq('token', token).maybeSingle()
  fail(error)
  const userId = asString((data as RecordRow | null)?.user_id)
  if (!userId) return null
  const [users, calendars] = await Promise.all([loadUsers(), loadCalendars()])
  if (!users.active.some((user) => user.id === userId)) return null
  // Links made before there were several calendars carry no calendar: they keep showing the main one.
  const calendar = calendarId ? calendars.find((item) => item.id === calendarId && item.isActive) : resolveCalendar(calendars, null)
  if (!calendar) return null

  const today = todayBangkok()
  const from = addDays(today, -60)
  const to = addDays(today, 365)
  const [types, events, holidays] = await Promise.all([
    loadTypes(calendar.id),
    loadEvents(from, to, users, { calendarId: calendar.id, userId: scope === 'mine' ? userId : undefined }),
    scope === 'team' ? loadHolidays(from, to) : Promise.resolve([] as CalendarHoliday[]),
  ])
  const typeById = new Map(types.map((type) => [type.id, type]))
  // Notes stay out of the feed: phone calendars sync to third-party servers. Titles are meant to be shared.
  const feed: FeedEvent[] = events.map((event) => {
    const type = typeById.get(event.typeId)
    const part = event.dayPart === 'full' ? '' : ` (${DAY_PART_LABEL[event.dayPart]})`
    const what = `${type?.name ?? 'รายการ'}${event.title ? `: ${event.title}` : ''}`
    const summary = scope === 'mine' ? `${what}${part}` : `${what} · ${event.userName}${part}`
    return { uid: `${event.id}@molecular-cbh-calendar`, startDate: event.startDate, endDate: event.endDate, summary, updatedAt: event.updatedAt }
  })
  for (const holiday of holidays.filter((item) => item.isDayOff)) {
    feed.push({ uid: `${holiday.id}@molecular-cbh-holiday`, startDate: holiday.date, endDate: holiday.date, summary: `วันหยุด: ${holiday.name}`, updatedAt: `${holiday.date}T00:00:00Z` })
  }
  if (calendar.isDefault) return buildIcsFeed(scope === 'mine' ? 'เวรและวันลาของฉัน · Genomics-CBH' : 'ปฏิทินทีม · Genomics-CBH', feed)
  return buildIcsFeed(`${calendar.name}${scope === 'mine' ? ' (ของฉัน)' : ''} · Genomics-CBH`, feed)
}

/* ---------- LINE heads-up digest ---------- */

/** Shown as the message's sender instead of the OA name, so the digest is distinguishable from HIV LAB Alert. Max 20 chars, must not contain "LINE". */
export const DIGEST_SENDER_NAME = 'น้องเบคล่อน'

/** LINE needs an absolute HTTPS PNG (1:1, ≤1MB). Served from public/line/beclon.png on the production domain. */
function digestSenderIconUrl() {
  const override = process.env.CALENDAR_LINE_ICON_URL?.trim()
  if (override) return override
  const origin = productionOrigin()
  return origin ? `${origin}/line/beclon.png` : undefined
}

function productionOrigin() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  return host ? `https://${host}` : undefined
}

class LineRejected extends Error {}

async function pushLine(message: Record<string, unknown>, retryKey: string, calendarGroupId: string | null) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()
  // A calendar may name its own group; otherwise the calendar group, falling back to the HIV LAB Alert group.
  const groupId = calendarGroupId || process.env.CALENDAR_LINE_GROUP_ID?.trim() || process.env.LINE_GROUP_ID?.trim()
  if (!token || !groupId) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_GROUP_ID')
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Line-Retry-Key': retryKey },
    body: JSON.stringify({ to: groupId, messages: [{ ...message, sender: { name: DIGEST_SENDER_NAME, iconUrl: digestSenderIconUrl() } }] }),
    cache: 'no-store',
  })
  // 409 = LINE already accepted this retry key, i.e. the earlier attempt went through.
  if (response.ok || response.status === 409) return
  const detail = await response.text().catch(() => '')
  if (response.status === 400) throw new LineRejected(`LINE ไม่รับข้อความ (400) ${detail.slice(0, 200)}`)
  throw new Error(`LINE ตอบกลับ ${response.status}`)
}

/** Sends the Flex card; if LINE rejects its structure, falls back to the plain-text version so the heads-up still goes out. */
async function pushDigest(calendar: CalendarBook, date: string, days: DigestDay[], text: string) {
  const origin = productionOrigin()
  const calendarParam = calendar.isDefault ? '' : `cal=${calendar.id}&`
  const calendarUrl = origin ? `${origin}/calendar?${calendarParam}view=week&date=${addDays(date, 1)}` : undefined
  const label = calendar.isDefault ? undefined : calendar.name
  try {
    await pushLine(buildDigestFlex(date, days, calendarUrl, label), crypto.randomUUID(), calendar.lineGroupId)
  } catch (error) {
    if (!(error instanceof LineRejected)) throw error
    await writeSystemAudit('calendar.digest_flex_rejected', 'calendar-digest', undefined, { date, calendarId: calendar.id, reason: error.message })
    await pushLine({ type: 'text', text }, crypto.randomUUID(), calendar.lineGroupId)
  }
}

type DigestResult = { calendarId: string; calendarName: string; date: string; status: string; duplicate: boolean; error?: string }

/**
 * Afternoon heads-up for tomorrow (through the next workday), one message per open calendar.
 * `date` is the send day. One calendar failing does not stop the others; the run then reports 502.
 */
export async function runDigest(date = todayBangkok()) {
  const [users, calendars, holidays] = await Promise.all([loadUsers(), loadCalendars(true), loadHolidays(date, addDays(date, 21))])
  const holidayByDate = new Map<string, string>()
  for (const holiday of holidays) if (holiday.isDayOff && !holidayByDate.has(holiday.date)) holidayByDate.set(holiday.date, holiday.name)
  const isOffDay = (day: string) => isWeekend(day) || holidayByDate.has(day)

  const results: DigestResult[] = []
  for (const calendar of calendars.filter((item) => item.isActive)) {
    try {
      results.push({ calendarId: calendar.id, calendarName: calendar.name, ...(await runDigestFor(calendar, date, users, isOffDay, holidayByDate)) })
    } catch (error) {
      results.push({ calendarId: calendar.id, calendarName: calendar.name, date, status: 'failed', duplicate: false, error: error instanceof Error ? error.message : 'send failed' })
    }
  }
  const failed = results.filter((result) => result.status === 'failed')
  if (failed.length) throw new HttpError(502, `ส่งแจ้งล่วงหน้าไม่สำเร็จ: ${failed.map((result) => `${result.calendarName} (${result.error})`).join(', ')}`)
  return { date, results }
}

async function runDigestFor(calendar: CalendarBook, date: string, users: LoadedUsers, isOffDay: (day: string) => boolean, holidayByDate: Map<string, string>) {
  const admin = getAdminClient()
  const types = await loadTypes(calendar.id)
  const targets = digestTargetDays(date, isOffDay)
  const events = await loadEvents(targets[0], targets[targets.length - 1], users, { calendarId: calendar.id })
  const typeById = new Map(types.map((type) => [type.id, type]))
  const days: DigestDay[] = targets.map((day) => ({
    date: day,
    isOffDay: isOffDay(day),
    holidayName: holidayByDate.get(day) ?? null,
    entries: events
      .filter((event) => covers(event, day))
      .flatMap((event) => {
        const type = typeById.get(event.typeId)
        return type?.inLineDigest
          ? [{ typeName: type.name, iconKey: type.iconKey, colorKey: type.colorKey, kind: type.kind, sortOrder: type.sortOrder, userName: event.userName, dayPart: event.dayPart, title: event.title }]
          : []
      }),
  }))

  const ledger = () => admin.from('bm_calendar_digest_runs')
  const { data: existing, error } = await ledger().select('*').eq('calendar_id', calendar.id).eq('digest_date', date).maybeSingle()
  fail(error)
  const run = existing as RecordRow | null
  if (run && (run.status === 'sent' || run.status === 'skipped')) return { date, status: asString(run.status), duplicate: true }
  if (run?.status === 'sending' && Date.now() - new Date(asString(run.started_at)).getTime() < 10 * 60_000) {
    return { date, status: 'sending', duplicate: true }
  }

  if (!shouldSendDigest(isOffDay(date), days)) {
    await ledger().upsert({ calendar_id: calendar.id, digest_date: date, status: 'skipped', finished_at: new Date().toISOString() })
    return { date, status: 'skipped', duplicate: false }
  }

  const message = buildDigestMessage(date, days, calendar.isDefault ? undefined : calendar.name)
  const attempts = Number(run?.attempts ?? 0) + 1
  const claim = run
    ? ledger()
        .update({ status: 'sending', message, attempts, started_at: new Date().toISOString(), error: null })
        .eq('calendar_id', calendar.id)
        .eq('digest_date', date)
        .eq('status', asString(run.status))
    : ledger().insert({ calendar_id: calendar.id, digest_date: date, status: 'sending', message, attempts })
  const { error: claimError } = await claim
  if (claimError) return { date, status: 'sending', duplicate: true }

  try {
    await pushDigest(calendar, date, days, message)
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : 'send failed'
    await ledger().update({ status: 'failed', error: reason, finished_at: new Date().toISOString() }).eq('calendar_id', calendar.id).eq('digest_date', date)
    await writeSystemAudit('calendar.digest_failed', 'calendar-digest', undefined, { date, calendarId: calendar.id, reason })
    throw new Error(reason)
  }
  await ledger().update({ status: 'sent', finished_at: new Date().toISOString() }).eq('calendar_id', calendar.id).eq('digest_date', date)
  await writeSystemAudit('calendar.digest_sent', 'calendar-digest', undefined, { date, calendarId: calendar.id, days: days.map((day) => day.date) })
  return { date, status: 'sent', duplicate: false }
}
