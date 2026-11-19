import 'server-only'

import { randomBytes } from 'node:crypto'
import type { BmActor, BmRole } from '@/lib/bm/types'
import { todayBangkok } from '@/lib/bm/rules'
import {
  addDays,
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
  type DigestEntry,
  type FeedEvent,
} from '@/lib/calendar/rules'
import {
  CALENDAR_COLORS,
  CALENDAR_KINDS,
  DAY_PARTS,
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
  if (role === 'Admin' || role === 'Assistant') return role
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

function mapType(row: RecordRow, usage: Map<string, number>): CalendarType {
  const id = asString(row.id)
  return {
    id,
    name: asString(row.name),
    iconKey: asString(row.icon_key),
    colorKey: pick(row.color_key, CALENDAR_COLORS, 'slate'),
    kind: pick(row.kind, CALENDAR_KINDS, 'other'),
    inLineDigest: row.in_line_digest === true,
    sortOrder: Number(row.sort_order ?? 100),
    isActive: row.is_active === true,
    usageCount: usage.get(id) ?? 0,
  }
}

function mapEvent(row: RecordRow, users: LoadedUsers): CalendarEvent {
  const userId = asString(row.user_id)
  return {
    id: asString(row.id),
    typeId: asString(row.type_id),
    userId,
    userName: users.nameById.get(userId) ?? 'ไม่พบผู้ใช้',
    startDate: asString(row.start_date),
    endDate: asString(row.end_date),
    dayPart: pick(row.day_part, DAY_PARTS, 'full'),
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

async function loadTypes(): Promise<CalendarType[]> {
  const admin = getAdminClient()
  const [{ data, error }, { data: usageRows, error: usageError }] = await Promise.all([
    admin.from('bm_calendar_types').select('*').order('sort_order').order('name'),
    admin.from('bm_calendar_events').select('type_id'),
  ])
  fail(error)
  fail(usageError)
  const usage = new Map<string, number>()
  for (const row of (usageRows ?? []) as RecordRow[]) usage.set(asString(row.type_id), (usage.get(asString(row.type_id)) ?? 0) + 1)
  return ((data ?? []) as RecordRow[]).map((row) => mapType(row, usage))
}

async function loadEvents(from: string, to: string, users: LoadedUsers, userId?: string) {
  let query = getAdminClient()
    .from('bm_calendar_events')
    .select('*')
    .is('deleted_at', null)
    .lte('start_date', to)
    .gte('end_date', from)
    .order('start_date')
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

export async function getCalendarWorkspace(from: string, to: string): Promise<CalendarWorkspace> {
  if (to < from || to > addDays(from, 62)) throw new HttpError(400, 'ช่วงวันที่ไม่ถูกต้อง')
  const users = await loadUsers()
  const [types, events, holidays, settings] = await Promise.all([
    loadTypes(),
    loadEvents(from, to, users),
    loadHolidays(from, to),
    getAdminClient().from('bm_calendar_settings').select('holidays_synced_at,holidays_sync_error').eq('id', true).maybeSingle(),
  ])
  fail(settings.error)
  const settingsRow = settings.data as RecordRow | null
  return {
    from,
    to,
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
  note: string | null
}

async function requireType(typeId: string, allowInactive = false) {
  const { data, error } = await getAdminClient().from('bm_calendar_types').select('id,name,is_active').eq('id', typeId).maybeSingle()
  fail(error)
  const row = data as RecordRow | null
  if (!row) throw new HttpError(404, 'ไม่พบประเภทนี้')
  if (!allowInactive && row.is_active !== true) throw new HttpError(400, 'ประเภทนี้ถูกปิดใช้งานแล้ว')
  return asString(row.name)
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
    typeId: asString(row.type_id),
    userId: asString(row.user_id),
    startDate: asString(row.start_date),
    endDate: asString(row.end_date),
    dayPart: asString(row.day_part),
    note: nullableString(row.note),
  }
}

export async function createCalendarEntry(input: EntryInput, actor: BmActor) {
  validateEntry(input)
  const today = todayBangkok()
  const denied = entryPermissionError(actor, input, today)
  if (denied) throw new HttpError(403, denied)
  await requireType(input.typeId)
  const users = await loadUsers()
  if (!users.active.some((user) => user.id === input.userId)) throw new HttpError(400, 'ไม่พบผู้ใช้นี้ในทีม')
  const row = {
    type_id: input.typeId,
    user_id: input.userId,
    start_date: input.startDate,
    end_date: input.endDate,
    day_part: input.dayPart,
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
  await requireType(input.typeId, input.typeId === before.typeId)
  const users = await loadUsers()
  if (input.userId !== before.userId && !users.active.some((user) => user.id === input.userId)) throw new HttpError(400, 'ไม่พบผู้ใช้นี้ในทีม')
  const after = { typeId: input.typeId, userId: input.userId, startDate: input.startDate, endDate: input.endDate, dayPart: input.dayPart, note: input.note }
  const { data, error } = await getAdminClient()
    .from('bm_calendar_events')
    .update({
      type_id: after.typeId,
      user_id: after.userId,
      start_date: after.startDate,
      end_date: after.endDate,
      day_part: after.dayPart,
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
  isActive: boolean
}

async function assertUniqueTypeName(name: string, exceptId?: string) {
  const { data, error } = await getAdminClient().from('bm_calendar_types').select('id,name')
  fail(error)
  const clash = ((data ?? []) as RecordRow[]).find((row) => asString(row.id) !== exceptId && normalizeTypeName(asString(row.name)) === normalizeTypeName(name))
  if (clash) throw new HttpError(409, `มีประเภท “${asString(clash.name)}” อยู่แล้ว`)
}

export async function createCalendarType(input: TypeInput, actor: BmActor) {
  assertAdmin(actor)
  const name = input.name.trim()
  await assertUniqueTypeName(name)
  const types = await loadTypes()
  const sortOrder = Math.max(0, ...types.map((type) => type.sortOrder)) + 10
  const { data, error } = await getAdminClient()
    .from('bm_calendar_types')
    .insert({
      name,
      icon_key: input.iconKey,
      color_key: input.colorKey,
      kind: input.kind,
      in_line_digest: input.inLineDigest,
      is_active: input.isActive,
      sort_order: sortOrder,
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'calendar.type_create', 'calendar-type', asString((data as RecordRow).id), { ...input, name })
  return loadTypes()
}

export async function updateCalendarType(id: string, input: TypeInput, actor: BmActor) {
  assertAdmin(actor)
  const name = input.name.trim()
  await assertUniqueTypeName(name, id)
  const { data, error } = await getAdminClient()
    .from('bm_calendar_types')
    .update({
      name,
      icon_key: input.iconKey,
      color_key: input.colorKey,
      kind: input.kind,
      in_line_digest: input.inLineDigest,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบประเภทนี้')
  await writeAudit(actor, 'calendar.type_update', 'calendar-type', id, { ...input, name })
  return loadTypes()
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
  const users = await loadUsers()
  const [types, events, holidays] = await Promise.all([loadTypes(), loadEvents(today, today, users), loadHolidays(today, today)])
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
export async function buildFeedForToken(token: string, scope: 'mine' | 'team') {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return null
  const admin = getAdminClient()
  const { data, error } = await admin.from('bm_calendar_feed_tokens').select('user_id').eq('token', token).maybeSingle()
  fail(error)
  const userId = asString((data as RecordRow | null)?.user_id)
  if (!userId) return null
  const users = await loadUsers()
  if (!users.active.some((user) => user.id === userId)) return null

  const today = todayBangkok()
  const from = addDays(today, -60)
  const to = addDays(today, 365)
  const [types, events, holidays] = await Promise.all([
    loadTypes(),
    loadEvents(from, to, users, scope === 'mine' ? userId : undefined),
    scope === 'team' ? loadHolidays(from, to) : Promise.resolve([] as CalendarHoliday[]),
  ])
  const typeById = new Map(types.map((type) => [type.id, type]))
  // Notes stay out of the feed: phone calendars sync to third-party servers.
  const feed: FeedEvent[] = events.map((event) => {
    const type = typeById.get(event.typeId)
    const part = event.dayPart === 'full' ? '' : ` (${DAY_PART_LABEL[event.dayPart]})`
    const summary = scope === 'mine' ? `${type?.name ?? 'รายการ'}${part}` : `${type?.name ?? 'รายการ'} · ${event.userName}${part}`
    return { uid: `${event.id}@molecular-cbh-calendar`, startDate: event.startDate, endDate: event.endDate, summary, updatedAt: event.updatedAt }
  })
  for (const holiday of holidays.filter((item) => item.isDayOff)) {
    feed.push({ uid: `${holiday.id}@molecular-cbh-holiday`, startDate: holiday.date, endDate: holiday.date, summary: `วันหยุด: ${holiday.name}`, updatedAt: `${holiday.date}T00:00:00Z` })
  }
  return buildIcsFeed(scope === 'mine' ? 'เวรและวันลาของฉัน · Molecular-CBH' : 'ปฏิทินทีม · Molecular-CBH', feed)
}

/* ---------- LINE morning digest ---------- */

async function pushLineText(text: string, retryKey: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()
  const groupId = process.env.LINE_GROUP_ID?.trim()
  if (!token || !groupId) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_GROUP_ID')
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Line-Retry-Key': retryKey },
    body: JSON.stringify({ to: groupId, messages: [{ type: 'text', text }] }),
    cache: 'no-store',
  })
  // 409 = LINE already accepted this retry key, i.e. the earlier attempt went through.
  if (!response.ok && response.status !== 409) throw new Error(`LINE ตอบกลับ ${response.status}`)
}

export async function runMorningDigest(date = todayBangkok()) {
  const admin = getAdminClient()
  const users = await loadUsers()
  const [types, events, holidays] = await Promise.all([loadTypes(), loadEvents(date, date, users), loadHolidays(date, date)])
  const typeById = new Map(types.map((type) => [type.id, type]))
  const entries: DigestEntry[] = events
    .filter((event) => covers(event, date))
    .flatMap((event) => {
      const type = typeById.get(event.typeId)
      return type?.inLineDigest ? [{ typeName: type.name, kind: type.kind, sortOrder: type.sortOrder, userName: event.userName, dayPart: event.dayPart }] : []
    })
  const holiday = holidays.find((item) => item.isDayOff) ?? null

  const { data: existing, error } = await admin.from('bm_calendar_digest_runs').select('*').eq('digest_date', date).maybeSingle()
  fail(error)
  const run = existing as RecordRow | null
  if (run && (run.status === 'sent' || run.status === 'skipped')) return { date, status: asString(run.status), duplicate: true }
  if (run?.status === 'sending' && Date.now() - new Date(asString(run.started_at)).getTime() < 10 * 60_000) {
    return { date, status: 'sending', duplicate: true }
  }

  if (!shouldSendDigest(date, Boolean(holiday), entries)) {
    await admin.from('bm_calendar_digest_runs').upsert({ digest_date: date, status: 'skipped', finished_at: new Date().toISOString() })
    return { date, status: 'skipped', duplicate: false }
  }

  const message = buildDigestMessage(date, entries, holiday?.name ?? null)
  const attempts = Number(run?.attempts ?? 0) + 1
  const claim = run
    ? admin.from('bm_calendar_digest_runs').update({ status: 'sending', message, attempts, started_at: new Date().toISOString(), error: null }).eq('digest_date', date).eq('status', asString(run.status))
    : admin.from('bm_calendar_digest_runs').insert({ digest_date: date, status: 'sending', message, attempts })
  const { error: claimError } = await claim
  if (claimError) return { date, status: 'sending', duplicate: true }

  try {
    await pushLineText(message, crypto.randomUUID())
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : 'send failed'
    await admin.from('bm_calendar_digest_runs').update({ status: 'failed', error: reason, finished_at: new Date().toISOString() }).eq('digest_date', date)
    await writeSystemAudit('calendar.digest_failed', 'calendar-digest', undefined, { date, reason })
    throw new HttpError(502, `ส่งสรุปเช้าไม่สำเร็จ: ${reason}`)
  }
  await admin.from('bm_calendar_digest_runs').update({ status: 'sent', finished_at: new Date().toISOString() }).eq('digest_date', date)
  await writeSystemAudit('calendar.digest_sent', 'calendar-digest', undefined, { date, lines: entries.length })
  return { date, status: 'sent', duplicate: false }
}
