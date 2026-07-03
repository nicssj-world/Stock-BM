import 'server-only'

import type {
  EnvCardStatus,
  EnvCorrectiveAction,
  EnvDashboard,
  EnvReading,
  EnvReadingPoint,
  EnvReadingStatus,
  EnvUnit,
  EnvUnitCard,
  EnvUnitKind,
  EnvWorkspace,
} from '@/lib/env/types'
import { ENV_TREND_POINTS } from '@/lib/env/types'
import type { BmActor } from '@/lib/bm/types'
import { todayBangkok } from '@/lib/bm/rules'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'Environment database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}
function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}
function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}
function nullableNumber(value: unknown) {
  return value == null || value === '' ? null : Number(value)
}
function clean(value: string | null | undefined) {
  return value?.trim() || null
}
function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
}

async function getNameMap(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map<string, string>()
  const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', ids)
  fail(error)
  return new Map(((data ?? []) as RecordRow[]).map((row) => [asString(row.id), asString(row.display_name)]))
}

function mapUnit(row: RecordRow, locationNames: Map<string, string>): EnvUnit {
  const locationId = nullableString(row.location_id)
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    kind: asString(row.kind) as EnvUnitKind,
    locationId,
    locationName: locationId ? locationNames.get(locationId) ?? null : null,
    qrToken: asString(row.qr_token),
    minLimit: nullableNumber(row.min_limit),
    maxLimit: nullableNumber(row.max_limit),
    unit: asString(row.unit) || '°C',
    readingsPerDay: row.readings_per_day == null ? 1 : Number(row.readings_per_day),
    isActive: Boolean(row.is_active),
  }
}

function mapReading(row: RecordRow, names: Map<string, string>): EnvReading {
  return {
    id: asString(row.id),
    unitId: asString(row.unit_id),
    readingDate: asString(row.reading_date),
    readingValue: Number(row.reading_value),
    recordedMin: nullableNumber(row.recorded_min),
    recordedMax: nullableNumber(row.recorded_max),
    status: asString(row.status) as EnvReadingStatus,
    isVoided: Boolean(row.is_voided),
    voidReason: nullableString(row.void_reason),
    note: nullableString(row.note),
    recordedByName: names.get(asString(row.recorded_by)) ?? null,
    createdAt: asString(row.created_at),
  }
}

// status against the unit's limits. No limits set → always in-range (record only).
export function evaluateReading(value: number, minLimit: number | null, maxLimit: number | null): EnvReadingStatus {
  if (minLimit != null && value < minLimit) return 'out-of-range'
  if (maxLimit != null && value > maxLimit) return 'out-of-range'
  return 'in-range'
}

async function loadLocationNames(): Promise<Map<string, string>> {
  const { data, error } = await getAdminClient().from('bm_stock_locations').select('id,name')
  fail(error)
  return new Map(((data ?? []) as RecordRow[]).map((row) => [asString(row.id), asString(row.name)]))
}

export async function getEnvDashboardData(actor: BmActor): Promise<EnvDashboard> {
  void actor
  const admin = getAdminClient()
  const today = todayBangkok()
  // 30-day window is enough for last reading + today's check — avoids fetching years of history
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [
    { data: unitData, error: unitError },
    { data: readingData, error: readingError },
    { data: caData, error: caError },
    locationNames,
  ] = await Promise.all([
    admin.from('env_monitored_units').select('*').eq('is_active', true).order('code'),
    admin.from('env_readings').select('*').gte('reading_date', since).order('reading_date', { ascending: false }),
    admin.from('env_corrective_actions').select('reading_id').eq('status', 'open'),
    loadLocationNames(),
  ])
  fail(unitError)
  fail(readingError)
  fail(caError)

  const readingRows = (readingData ?? []) as RecordRow[]
  const caRows = (caData ?? []) as RecordRow[]
  const names = await getNameMap(readingRows.map((r) => asString(r.recorded_by)))
  const units = ((unitData ?? []) as RecordRow[]).map((row) => mapUnit(row, locationNames))

  const byUnit = new Map<string, EnvReading[]>()
  for (const row of readingRows) {
    const r = mapReading(row, names)
    const list = byUnit.get(r.unitId) ?? []
    list.push(r)
    byUnit.set(r.unitId, list)
  }

  const readingUnit = new Map(readingRows.map((r) => [asString(r.id), asString(r.unit_id)]))
  const openCaByUnit = new Map<string, number>()
  for (const row of caRows) {
    const unitId = readingUnit.get(asString(row.reading_id))
    if (!unitId) continue
    openCaByUnit.set(unitId, (openCaByUnit.get(unitId) ?? 0) + 1)
  }

  const cards = units
    .map((unit) => {
      const unitReadings = byUnit.get(unit.id) ?? []
      const todayReadings = unitReadings.filter((r) => r.readingDate === today && !r.isVoided)
      const todayReadingCount = todayReadings.length
      const loggedToday = todayReadingCount >= unit.readingsPerDay
      const todayReading = todayReadings[0] ?? null
      const lastReading = unitReadings.find((r) => !r.isVoided) ?? null
      const outOfRangeToday = todayReadings.find((r) => r.status === 'out-of-range')
      const correctedToday = todayReadings.find((r) => r.status === 'corrected')
      const status: EnvCardStatus = outOfRangeToday ? 'out-of-range' : correctedToday ? 'corrected' : loggedToday ? 'in-range' : 'pending'
      return { unit, todayReading, todayReadingCount, loggedToday, lastReading, status, openCorrectiveActions: openCaByUnit.get(unit.id) ?? 0 }
    })
    .sort((a, b) => rank(a.status) - rank(b.status) || a.unit.code.localeCompare(b.unit.code))

  const loggedToday = cards.filter((c) => c.loggedToday).length
  const outOfRangeToday = cards.filter((c) => c.status === 'out-of-range').length
  return {
    cards,
    summary: {
      unitCount: cards.length,
      loggedToday,
      pendingToday: cards.length - loggedToday,
      outOfRangeToday,
      openCorrectiveActions: caRows.length,
    },
  }
}

export async function getEnvironmentWorkspace(actor: BmActor): Promise<EnvWorkspace> {
  void actor
  const admin = getAdminClient()
  const today = todayBangkok()
  const [
    { data: unitData, error: unitError },
    { data: readingData, error: readingError },
    { data: caData, error: caError },
    locationNames,
  ] = await Promise.all([
    admin.from('env_monitored_units').select('*').order('code'),
    admin.from('env_readings').select('*').order('reading_date', { ascending: false }),
    admin.from('env_corrective_actions').select('*').order('created_at', { ascending: false }),
    loadLocationNames(),
  ])
  fail(unitError)
  fail(readingError)
  fail(caError)

  const readingRows = (readingData ?? []) as RecordRow[]
  const caRows = (caData ?? []) as RecordRow[]
  const names = await getNameMap([
    ...readingRows.map((row) => asString(row.recorded_by)),
    ...caRows.flatMap((row) => [asString(row.created_by), asString(row.closed_by)]),
  ])

  const units = ((unitData ?? []) as RecordRow[]).map((row) => mapUnit(row, locationNames))
  const unitById = new Map(units.map((unit) => [unit.id, unit]))
  const readings = readingRows.map((row) => mapReading(row, names))

  // group readings per unit (already sorted newest first)
  const byUnit = new Map<string, EnvReading[]>()
  for (const reading of readings) {
    const list = byUnit.get(reading.unitId) ?? []
    list.push(reading)
    byUnit.set(reading.unitId, list)
  }

  const openCaByUnit = new Map<string, number>()
  const readingUnit = new Map(readings.map((reading) => [reading.id, reading.unitId]))
  for (const row of caRows) {
    if (asString(row.status) !== 'open') continue
    const unitId = readingUnit.get(asString(row.reading_id))
    if (!unitId) continue
    openCaByUnit.set(unitId, (openCaByUnit.get(unitId) ?? 0) + 1)
  }

  const cards: EnvUnitCard[] = units
    .filter((unit) => unit.isActive)
    .map((unit) => {
      const unitReadings = byUnit.get(unit.id) ?? []
      const todayReadings = unitReadings.filter((reading) => reading.readingDate === today && !reading.isVoided)
      const todayReadingCount = todayReadings.length
      const loggedToday = todayReadingCount >= unit.readingsPerDay
      const todayReading = todayReadings[0] ?? null
      const lastReading = unitReadings.find((reading) => !reading.isVoided) ?? null
      const outOfRangeToday = todayReadings.find((r) => r.status === 'out-of-range')
      const correctedToday = todayReadings.find((r) => r.status === 'corrected')
      const status: EnvCardStatus = outOfRangeToday ? 'out-of-range' : correctedToday ? 'corrected' : loggedToday ? 'in-range' : 'pending'
      const points: EnvReadingPoint[] = unitReadings
        .filter((reading) => !reading.isVoided)
        .slice(0, ENV_TREND_POINTS)
        .reverse()
        .map((reading) => ({ id: reading.id, readingDate: reading.readingDate, value: reading.readingValue, status: reading.status, isVoided: reading.isVoided }))
      return {
        unit,
        todayReading,
        todayReadingCount,
        loggedToday,
        lastReading,
        status,
        points,
        openCorrectiveActions: openCaByUnit.get(unit.id) ?? 0,
      }
    })
    // surface attention first: out-of-range, pending, then in-range; by code
    .sort((a, b) => rank(a.status) - rank(b.status) || a.unit.code.localeCompare(b.unit.code))

  const correctiveActions: EnvCorrectiveAction[] = caRows.map((row) => {
    const readingId = asString(row.reading_id)
    const unitId = readingUnit.get(readingId) ?? ''
    return {
      id: asString(row.id),
      readingId,
      unitId,
      unitName: unitById.get(unitId)?.name ?? '-',
      readingDate: '',
      problem: asString(row.problem),
      rootCause: nullableString(row.root_cause),
      actionTaken: nullableString(row.action_taken),
      status: asString(row.status) === 'closed' ? 'closed' : 'open',
      createdByName: names.get(asString(row.created_by)) ?? null,
      createdAt: asString(row.created_at),
      closedByName: row.closed_by ? names.get(asString(row.closed_by)) ?? null : null,
      closedAt: nullableString(row.closed_at),
    }
  })

  const loggedToday = cards.filter((card) => card.loggedToday).length
  const outOfRangeToday = cards.filter((card) => card.status === 'out-of-range').length

  return {
    units,
    cards,
    readings,
    correctiveActions,
    today,
    summary: {
      unitCount: cards.length,
      loggedToday,
      pendingToday: cards.length - loggedToday,
      outOfRangeToday,
      openCorrectiveActions: correctiveActions.filter((ca) => ca.status === 'open').length,
    },
  }
}

function rank(status: EnvCardStatus) {
  return status === 'out-of-range' ? 0 : status === 'pending' ? 1 : status === 'corrected' ? 2 : 3
}

// Resolve a unit from its QR token (sticker deep-link target). Active units only.
export async function resolveEnvToken(token: string): Promise<EnvUnit> {
  const trimmed = token.trim()
  if (!trimmed) throw new HttpError(404, 'Unit not found')
  const { data, error } = await getAdminClient()
    .from('env_monitored_units')
    .select('*')
    .eq('qr_token', trimmed)
    .eq('is_active', true)
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Monitored unit not found')
  const locationNames = await loadLocationNames()
  return mapUnit(data as RecordRow, locationNames)
}

interface LogReadingInput {
  unitId: string
  readingValue: number
  recordedMin?: number | null
  recordedMax?: number | null
  note?: string | null
  readingDate?: string | null
}

export async function logReading(input: LogReadingInput, actor: BmActor): Promise<{ reading: EnvReading; outOfRange: boolean }> {
  const admin = getAdminClient()
  const { data: unitRow, error: unitError } = await admin.from('env_monitored_units').select('*').eq('id', input.unitId).maybeSingle()
  fail(unitError)
  if (!unitRow || !(unitRow as RecordRow).is_active) throw new HttpError(404, 'Active monitored unit not found')
  const unit = mapUnit(unitRow as RecordRow, new Map())

  const readingDate = clean(input.readingDate) ?? todayBangkok()
  const status = evaluateReading(input.readingValue, unit.minLimit, unit.maxLimit)

  const { data, error } = await admin
    .from('env_readings')
    .insert({
      unit_id: unit.id,
      reading_date: readingDate,
      reading_value: input.readingValue,
      recorded_min: input.recordedMin ?? null,
      recorded_max: input.recordedMax ?? null,
      status,
      note: clean(input.note),
      recorded_by: actor.id,
    })
    .select('*')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'บันทึกอุณหภูมิของตู้นี้วันนี้ไปแล้ว / Already logged today')
    throw new HttpError(400, error.message || 'Could not save reading')
  }

  const reading = mapReading(data as RecordRow, new Map([[actor.id, actor.displayName]]))
  await writeAudit(actor, 'env.reading.log', 'env-reading', reading.id, {
    unitCode: unit.code,
    value: input.readingValue,
    status,
    readingDate,
  })
  return { reading, outOfRange: status === 'out-of-range' }
}

export async function voidReading(id: string, reason: string, actor: BmActor): Promise<void> {
  const trimmed = reason.trim()
  if (!trimmed) throw new HttpError(400, 'Void reason is required')
  const admin = getAdminClient()
  const { error } = await admin.from('env_readings').update({ is_voided: true, void_reason: trimmed }).eq('id', id)
  fail(error)
  await writeAudit(actor, 'env.reading.void', 'env-reading', id, { reason: trimmed })
}

interface UnitInput {
  code: string
  name: string
  kind: EnvUnitKind
  locationId?: string | null
  minLimit?: number | null
  maxLimit?: number | null
  unit?: string | null
}

export async function createUnit(input: UnitInput, actor: BmActor): Promise<EnvUnit> {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('env_monitored_units')
    .insert({
      code: input.code.trim(),
      name: input.name.trim(),
      kind: input.kind,
      location_id: clean(input.locationId),
      min_limit: input.minLimit ?? null,
      max_limit: input.maxLimit ?? null,
      unit: clean(input.unit) ?? '°C',
      created_by: actor.id,
    })
    .select('*')
    .single()
  if (error) throw new HttpError(400, error.message || 'Could not create unit')
  const locationNames = await loadLocationNames()
  const created = mapUnit(data as RecordRow, locationNames)
  await writeAudit(actor, 'env.unit.create', 'env-unit', created.id, { code: created.code, name: created.name })
  return created
}

interface UnitUpdate {
  name?: string
  kind?: EnvUnitKind
  locationId?: string | null
  minLimit?: number | null
  maxLimit?: number | null
  unit?: string | null
  isActive?: boolean
}

export async function updateUnit(id: string, patch: UnitUpdate, actor: BmActor): Promise<EnvUnit> {
  assertAdmin(actor)
  const update: RecordRow = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.kind !== undefined) update.kind = patch.kind
  if (patch.locationId !== undefined) update.location_id = clean(patch.locationId)
  if (patch.minLimit !== undefined) update.min_limit = patch.minLimit
  if (patch.maxLimit !== undefined) update.max_limit = patch.maxLimit
  if (patch.unit !== undefined) update.unit = clean(patch.unit) ?? '°C'
  if (patch.isActive !== undefined) update.is_active = patch.isActive
  const admin = getAdminClient()
  const { data, error } = await admin.from('env_monitored_units').update(update).eq('id', id).select('*').single()
  if (error) throw new HttpError(400, error.message || 'Could not update unit')
  const locationNames = await loadLocationNames()
  const updated = mapUnit(data as RecordRow, locationNames)
  await writeAudit(actor, 'env.unit.update', 'env-unit', id, { patch })
  return updated
}

interface CorrectiveActionInput {
  readingId: string
  problem: string
  rootCause?: string | null
  actionTaken?: string | null
}

export async function saveCorrectiveAction(input: CorrectiveActionInput, actor: BmActor): Promise<string> {
  const problem = input.problem.trim()
  if (!problem) throw new HttpError(400, 'Problem description is required')
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('env_corrective_actions')
    .insert({
      reading_id: input.readingId,
      problem,
      root_cause: clean(input.rootCause),
      action_taken: clean(input.actionTaken),
      created_by: actor.id,
    })
    .select('id')
    .single()
  if (error) throw new HttpError(400, error.message || 'Could not save corrective action')
  const id = asString((data as RecordRow).id)
  await writeAudit(actor, 'env.corrective-action.create', 'env-corrective-action', id, { readingId: input.readingId })
  return id
}

export async function closeCorrectiveAction(id: string, actor: BmActor): Promise<void> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('env_corrective_actions')
    .update({ status: 'closed', closed_by: actor.id, closed_at: new Date().toISOString() })
    .eq('id', id)
    .select('reading_id')
    .single()
  if (error) throw new HttpError(400, error.message || 'Could not close corrective action')
  // mark the linked reading as corrected (keeps it visibly distinct from in-range)
  const readingId = asString((data as RecordRow).reading_id)
  if (readingId) await admin.from('env_readings').update({ status: 'corrected' }).eq('id', readingId).eq('status', 'out-of-range')
  await writeAudit(actor, 'env.corrective-action.close', 'env-corrective-action', id, {})
}
