import 'server-only'

import type {
  EnvCardStatus,
  EnvCorrectiveAction,
  EnvDashboard,
  EnvMonthlyReview,
  EnvPeriodIndex,
  EnvReading,
  EnvReadingPoint,
  EnvReadingStatus,
  EnvUnit,
  EnvUnitAvailabilityStatus,
  EnvUnitCard,
  EnvUnitKind,
  EnvWorkspace,
} from '@/lib/env/types'
import { ENV_TREND_POINTS, envPeriodLabel, normalizeEnvReadingsPerDay } from '@/lib/env/types'
import type { BmActor } from '@/lib/bm/types'
import type { StockLocation } from '@/lib/bm/types'
import { todayBangkok } from '@/lib/bm/rules'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'Environment database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}
function isMissingTableError(error: { message?: string; code?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find the table/i.test(error?.message ?? '')
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
function envPeriodIndex(value: unknown): EnvPeriodIndex {
  const periodIndex = Number(value)
  return (periodIndex === 2 || periodIndex === 3 ? periodIndex : 1) as EnvPeriodIndex
}
function availabilityStatus(value: unknown): EnvUnitAvailabilityStatus {
  return value === 'maintenance' || value === 'paused' ? value : 'active'
}
function yearMonth(value: string) {
  return value.slice(0, 7)
}
function monthStartAfter(value: string) {
  const [year, month] = value.split('-').map(Number)
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return `${next.year}-${String(next.month).padStart(2, '0')}-01`
}
function currentBangkokHour() {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23' }).format(new Date())
  return Number(hour)
}
function duePeriodIndexes(readingsPerDay: number, hour = currentBangkokHour()): EnvPeriodIndex[] {
  const count = normalizeEnvReadingsPerDay(readingsPerDay)
  if (count === 1) return hour >= 8 ? [1] : []
  if (count === 2) return [hour >= 8 ? 1 : null, hour >= 16 ? 2 : null].filter(Boolean) as EnvPeriodIndex[]
  return [3, hour >= 8 ? 1 : null, hour >= 16 ? 2 : null].filter(Boolean) as EnvPeriodIndex[]
}
function clean(value: string | null | undefined) {
  return value?.trim() || null
}
function unitUnavailableOn(unit: Pick<EnvUnit, 'availabilityStatus' | 'unavailableFrom' | 'unavailableUntil'>, date: string) {
  if (unit.availabilityStatus === 'active') return false
  if (unit.unavailableFrom && date < unit.unavailableFrom) return false
  if (unit.unavailableUntil && date > unit.unavailableUntil) return false
  return true
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

function mapStockLocation(row: RecordRow): StockLocation {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    storageCondition: nullableString(row.storage_condition),
    isActive: Boolean(row.is_active),
  }
}

function mapUnit(row: RecordRow, locations: Map<string, StockLocation>): EnvUnit {
  const locationId = nullableString(row.location_id)
  const location = locationId ? locations.get(locationId) ?? null : null
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: location?.name || asString(row.name),
    kind: asString(row.kind) as EnvUnitKind,
    locationId,
    locationCode: location?.code ?? null,
    locationName: location?.name ?? null,
    qrToken: asString(row.qr_token),
    minLimit: nullableNumber(row.min_limit),
    maxLimit: nullableNumber(row.max_limit),
    unit: asString(row.unit) || '°C',
    readingsPerDay: normalizeEnvReadingsPerDay(Number(row.readings_per_day ?? 1)),
    trackHumidity: Boolean(row.track_humidity),
    humidityMinLimit: nullableNumber(row.humidity_min_limit),
    humidityMaxLimit: nullableNumber(row.humidity_max_limit),
    thermometerId: nullableString(row.thermometer_id),
    dataloggerId: nullableString(row.datalogger_id),
    calibrationDueDate: nullableString(row.calibration_due_date),
    availabilityStatus: availabilityStatus(row.availability_status),
    unavailableFrom: nullableString(row.unavailable_from),
    unavailableUntil: nullableString(row.unavailable_until),
    unavailableNote: nullableString(row.unavailable_note),
    isActive: Boolean(row.is_active),
  }
}

function mapReading(row: RecordRow, names: Map<string, string>): EnvReading {
  return {
    id: asString(row.id),
    unitId: asString(row.unit_id),
    readingDate: asString(row.reading_date),
    periodIndex: envPeriodIndex(row.period_index),
    periodLabel: envPeriodLabel(Number(row.period_index ?? 1)),
    readingValue: Number(row.reading_value),
    humidityPercent: nullableNumber(row.humidity_percent),
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

function mapMonthlyReview(row: RecordRow, names: Map<string, string>): EnvMonthlyReview {
  return {
    id: asString(row.id),
    unitId: asString(row.unit_id),
    yearMonth: asString(row.year_month),
    note: nullableString(row.note),
    reviewedByName: names.get(asString(row.reviewed_by)) ?? null,
    reviewedAt: asString(row.reviewed_at),
  }
}

// status against the unit's limits. No limits set → always in-range (record only).
export function evaluateReading(value: number, minLimit: number | null, maxLimit: number | null): EnvReadingStatus {
  if (minLimit != null && value < minLimit) return 'out-of-range'
  if (maxLimit != null && value > maxLimit) return 'out-of-range'
  return 'in-range'
}

function isHumidityOutOfRange(unit: Pick<EnvUnit, 'trackHumidity' | 'humidityMinLimit' | 'humidityMaxLimit'>, value: number | null) {
  if (!unit.trackHumidity || value == null) return false
  if (unit.humidityMinLimit != null && value < unit.humidityMinLimit) return true
  if (unit.humidityMaxLimit != null && value > unit.humidityMaxLimit) return true
  return false
}

async function loadStockLocations(): Promise<StockLocation[]> {
  const { data, error } = await getAdminClient().from('bm_stock_locations').select('*').order('code')
  fail(error)
  return ((data ?? []) as RecordRow[]).map(mapStockLocation)
}

function locationMap(locations: StockLocation[]) {
  return new Map(locations.map((location) => [location.id, location]))
}

function assertYearMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new HttpError(400, 'Invalid review month')
}

async function assertMonthUnlocked(unitId: string, reviewMonth: string) {
  const { data, error } = await getAdminClient()
    .from('env_monthly_reviews')
    .select('id')
    .eq('unit_id', unitId)
    .eq('year_month', reviewMonth)
    .maybeSingle()
  if (isMissingTableError(error)) return
  fail(error)
  if (data) throw new HttpError(409, `Temperature month ${reviewMonth} has been reviewed and locked`)
}

async function monthReadingIds(unitId: string, reviewMonth: string) {
  const { data, error } = await getAdminClient()
    .from('env_readings')
    .select('id')
    .eq('unit_id', unitId)
    .gte('reading_date', `${reviewMonth}-01`)
    .lt('reading_date', monthStartAfter(reviewMonth))
  fail(error)
  return ((data ?? []) as RecordRow[]).map((row) => asString(row.id)).filter(Boolean)
}

async function assertNoOpenCorrectiveActions(unitId: string, reviewMonth: string) {
  const readingIds = await monthReadingIds(unitId, reviewMonth)
  if (!readingIds.length) return
  const { count, error } = await getAdminClient()
    .from('env_corrective_actions')
    .select('id', { count: 'exact', head: true })
    .in('reading_id', readingIds)
    .eq('status', 'open')
  fail(error)
  if ((count ?? 0) > 0) throw new HttpError(409, 'ยังมี corrective action ค้างอยู่ในเดือนนี้ กรุณาปิด CA ก่อน lock รายเดือน')
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
    locations,
  ] = await Promise.all([
    admin.from('env_monitored_units').select('*').eq('is_active', true).order('code'),
    admin.from('env_readings').select('*').gte('reading_date', since).order('reading_date', { ascending: false }),
    admin.from('env_corrective_actions').select('reading_id').eq('status', 'open'),
    loadStockLocations(),
  ])
  fail(unitError)
  fail(readingError)
  fail(caError)

  const readingRows = (readingData ?? []) as RecordRow[]
  const caRows = (caData ?? []) as RecordRow[]
  const names = await getNameMap(readingRows.map((r) => asString(r.recorded_by)))
  const locationsById = locationMap(locations)
  const units = ((unitData ?? []) as RecordRow[]).map((row) => mapUnit(row, locationsById))

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
      const todayPeriodIndexes = todayReadings.map((reading) => reading.periodIndex)
      const unavailableToday = unitUnavailableOn(unit, today)
      const missingPeriodIndexes = ([1, 2, 3] as EnvPeriodIndex[]).slice(0, unit.readingsPerDay).filter((periodIndex) => !todayPeriodIndexes.includes(periodIndex))
      const dueNowPeriodIndexes = unavailableToday ? [] : duePeriodIndexes(unit.readingsPerDay).filter((periodIndex) => missingPeriodIndexes.includes(periodIndex))
      const loggedToday = !unavailableToday && todayReadingCount >= unit.readingsPerDay
      const todayReading = todayReadings[0] ?? null
      const lastReading = unitReadings.find((r) => !r.isVoided) ?? null
      const outOfRangeToday = todayReadings.find((r) => r.status === 'out-of-range')
      const correctedToday = todayReadings.find((r) => r.status === 'corrected')
      const status: EnvCardStatus = unavailableToday ? 'unavailable' : outOfRangeToday ? 'out-of-range' : correctedToday ? 'corrected' : loggedToday ? 'in-range' : 'pending'
      return { unit, todayReading, todayReadingCount, todayPeriodIndexes, missingPeriodIndexes, duePeriodIndexes: dueNowPeriodIndexes, loggedToday, lastReading, status, openCorrectiveActions: openCaByUnit.get(unit.id) ?? 0 }
    })
    .sort((a, b) => rankCard(a) - rankCard(b) || a.unit.code.localeCompare(b.unit.code))

  const loggedToday = cards.filter((c) => c.loggedToday).length
  const outOfRangeToday = cards.filter((c) => c.status === 'out-of-range').length
  const dueNowCount = cards.filter((card) => card.duePeriodIndexes.length > 0).length
  const pendingToday = cards.filter((card) => card.status === 'pending').length
  return {
    cards,
    summary: {
      unitCount: cards.length,
      loggedToday,
      pendingToday,
      dueNowCount,
      dueNowPeriodCount: cards.reduce((sum, card) => sum + card.duePeriodIndexes.length, 0),
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
    { data: reviewData, error: reviewError },
    locations,
  ] = await Promise.all([
    admin.from('env_monitored_units').select('*').order('code'),
    admin.from('env_readings').select('*').order('reading_date', { ascending: false }),
    admin.from('env_corrective_actions').select('*').order('created_at', { ascending: false }),
    admin.from('env_monthly_reviews').select('*').order('year_month', { ascending: false }).limit(1000),
    loadStockLocations(),
  ])
  fail(unitError)
  fail(readingError)
  fail(caError)
  if (reviewError && !isMissingTableError(reviewError)) fail(reviewError)

  const readingRows = (readingData ?? []) as RecordRow[]
  const caRows = (caData ?? []) as RecordRow[]
  const reviewRows = reviewError ? [] : (reviewData ?? []) as RecordRow[]
  const names = await getNameMap([
    ...readingRows.map((row) => asString(row.recorded_by)),
    ...caRows.flatMap((row) => [asString(row.created_by), asString(row.closed_by)]),
    ...reviewRows.map((row) => asString(row.reviewed_by)),
  ])

  const locationsById = locationMap(locations)
  const units = ((unitData ?? []) as RecordRow[]).map((row) => mapUnit(row, locationsById))
  const unitById = new Map(units.map((unit) => [unit.id, unit]))
  const readings = readingRows.map((row) => mapReading(row, names))
  const readingById = new Map(readings.map((reading) => [reading.id, reading]))

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
      const todayPeriodIndexes = todayReadings.map((reading) => reading.periodIndex)
      const unavailableToday = unitUnavailableOn(unit, today)
      const missingPeriodIndexes = ([1, 2, 3] as EnvPeriodIndex[]).slice(0, unit.readingsPerDay).filter((periodIndex) => !todayPeriodIndexes.includes(periodIndex))
      const dueNowPeriodIndexes = unavailableToday ? [] : duePeriodIndexes(unit.readingsPerDay).filter((periodIndex) => missingPeriodIndexes.includes(periodIndex))
      const loggedToday = !unavailableToday && todayReadingCount >= unit.readingsPerDay
      const todayReading = todayReadings[0] ?? null
      const lastReading = unitReadings.find((reading) => !reading.isVoided) ?? null
      const outOfRangeToday = todayReadings.find((r) => r.status === 'out-of-range')
      const correctedToday = todayReadings.find((r) => r.status === 'corrected')
      const status: EnvCardStatus = unavailableToday ? 'unavailable' : outOfRangeToday ? 'out-of-range' : correctedToday ? 'corrected' : loggedToday ? 'in-range' : 'pending'
      const points: EnvReadingPoint[] = unitReadings
        .filter((reading) => !reading.isVoided)
        .slice(0, ENV_TREND_POINTS)
        .reverse()
        .map((reading) => ({ id: reading.id, readingDate: reading.readingDate, periodIndex: reading.periodIndex, value: reading.readingValue, humidityValue: reading.humidityPercent, status: reading.status, isVoided: reading.isVoided }))
      return {
        unit,
        todayReading,
        todayReadingCount,
        todayPeriodIndexes,
        missingPeriodIndexes,
        duePeriodIndexes: dueNowPeriodIndexes,
        loggedToday,
        lastReading,
        status,
        points,
        openCorrectiveActions: openCaByUnit.get(unit.id) ?? 0,
      }
    })
    // surface attention first: out-of-range, pending, then in-range; by code
    .sort((a, b) => rankCard(a) - rankCard(b) || a.unit.code.localeCompare(b.unit.code))

  const correctiveActions: EnvCorrectiveAction[] = caRows.map((row) => {
    const readingId = asString(row.reading_id)
    const unitId = readingUnit.get(readingId) ?? ''
    return {
      id: asString(row.id),
      readingId,
      unitId,
      unitName: unitById.get(unitId)?.name ?? '-',
      readingDate: readingById.get(readingId)?.readingDate ?? '',
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
  const dueNowCount = cards.filter((card) => card.duePeriodIndexes.length > 0).length
  const pendingToday = cards.filter((card) => card.status === 'pending').length

  return {
    locations,
    units,
    cards,
    readings,
    correctiveActions,
    monthlyReviews: reviewRows.map((row) => mapMonthlyReview(row, names)),
    today,
    summary: {
      unitCount: cards.length,
      loggedToday,
      pendingToday,
      dueNowCount,
      dueNowPeriodCount: cards.reduce((sum, card) => sum + card.duePeriodIndexes.length, 0),
      outOfRangeToday,
      openCorrectiveActions: correctiveActions.filter((ca) => ca.status === 'open').length,
    },
  }
}

function rankCard(card: Pick<EnvUnitCard, 'status' | 'duePeriodIndexes'>) {
  if (card.status === 'out-of-range') return 0
  if (card.duePeriodIndexes.length > 0) return 1
  if (card.status === 'pending') return 2
  if (card.status === 'corrected') return 3
  if (card.status === 'unavailable') return 4
  return 5
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
  const locations = await loadStockLocations()
  return mapUnit(data as RecordRow, locationMap(locations))
}

interface LogReadingInput {
  unitId: string
  readingValue: number
  humidityPercent?: number | null
  recordedMin?: number | null
  recordedMax?: number | null
  periodIndex?: number | null
  note?: string | null
  readingDate?: string | null
}

export async function logReading(input: LogReadingInput, actor: BmActor): Promise<{ reading: EnvReading; outOfRange: boolean }> {
  const admin = getAdminClient()
  const { data: unitRow, error: unitError } = await admin.from('env_monitored_units').select('*').eq('id', input.unitId).maybeSingle()
  fail(unitError)
  if (!unitRow || !(unitRow as RecordRow).is_active) throw new HttpError(404, 'Active monitored unit not found')
  const unit = mapUnit(unitRow as RecordRow, new Map<string, StockLocation>())

  const readingDate = clean(input.readingDate) ?? todayBangkok()
  if (unitUnavailableOn(unit, readingDate)) throw new HttpError(409, 'ตู้นี้อยู่ในสถานะซ่อม/พักใช้งานในวันที่เลือก จึงไม่ต้องบันทึกอุณหภูมิ')
  await assertMonthUnlocked(unit.id, yearMonth(readingDate))
  const periodIndex = Math.min(Math.max(Number(input.periodIndex ?? 1), 1), unit.readingsPerDay)
  const humidityPercent = input.humidityPercent ?? null
  if (unit.trackHumidity && humidityPercent == null) throw new HttpError(400, 'Relative humidity is required for this unit')
  if (humidityPercent != null && (humidityPercent < 0 || humidityPercent > 100)) throw new HttpError(400, 'Humidity must be between 0 and 100%')
  const temperatureStatus = evaluateReading(input.readingValue, unit.minLimit, unit.maxLimit)
  const humidityOutOfRange = isHumidityOutOfRange(unit, humidityPercent)
  const status: EnvReadingStatus = temperatureStatus === 'out-of-range' || humidityOutOfRange ? 'out-of-range' : 'in-range'

  const { data, error } = await admin
    .from('env_readings')
    .insert({
      unit_id: unit.id,
      reading_date: readingDate,
      period_index: periodIndex,
      reading_value: input.readingValue,
      humidity_percent: humidityPercent,
      recorded_min: input.recordedMin ?? null,
      recorded_max: input.recordedMax ?? null,
      status,
      note: clean(input.note),
      recorded_by: actor.id,
    })
    .select('*')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'บันทึกอุณหภูมิของตู้นี้ในรอบนี้แล้ว / Already logged for this shift')
    throw new HttpError(400, error.message || 'Could not save reading')
  }

  const reading = mapReading(data as RecordRow, new Map([[actor.id, actor.displayName]]))
  await writeAudit(actor, 'env.reading.log', 'env-reading', reading.id, {
    unitCode: unit.code,
    value: input.readingValue,
    humidityPercent,
    status,
    readingDate,
    periodIndex,
  })
  return { reading, outOfRange: status === 'out-of-range' }
}

export async function voidReading(id: string, reason: string, actor: BmActor): Promise<void> {
  assertAdmin(actor)
  const trimmed = reason.trim()
  if (!trimmed) throw new HttpError(400, 'Void reason is required')
  const admin = getAdminClient()
  const { data: readingRow, error: readingError } = await admin.from('env_readings').select('unit_id,reading_date').eq('id', id).maybeSingle()
  fail(readingError)
  if (!readingRow) throw new HttpError(404, 'Reading not found')
  await assertMonthUnlocked(asString((readingRow as RecordRow).unit_id), yearMonth(asString((readingRow as RecordRow).reading_date)))
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
  readingsPerDay?: number | null
  trackHumidity?: boolean | null
  humidityMinLimit?: number | null
  humidityMaxLimit?: number | null
  thermometerId?: string | null
  dataloggerId?: string | null
  calibrationDueDate?: string | null
  availabilityStatus?: EnvUnitAvailabilityStatus
  unavailableFrom?: string | null
  unavailableUntil?: string | null
  unavailableNote?: string | null
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
      readings_per_day: normalizeEnvReadingsPerDay(Number(input.readingsPerDay ?? 1)),
      track_humidity: Boolean(input.trackHumidity),
      humidity_min_limit: input.humidityMinLimit ?? null,
      humidity_max_limit: input.humidityMaxLimit ?? null,
      thermometer_id: clean(input.thermometerId),
      datalogger_id: clean(input.dataloggerId),
      calibration_due_date: input.calibrationDueDate || null,
      availability_status: input.availabilityStatus ?? 'active',
      unavailable_from: input.unavailableFrom || null,
      unavailable_until: input.unavailableUntil || null,
      unavailable_note: clean(input.unavailableNote),
      created_by: actor.id,
    })
    .select('*')
    .single()
  if (error) throw new HttpError(400, error.message || 'Could not create unit')
  const locations = await loadStockLocations()
  const created = mapUnit(data as RecordRow, locationMap(locations))
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
  readingsPerDay?: number | null
  trackHumidity?: boolean | null
  humidityMinLimit?: number | null
  humidityMaxLimit?: number | null
  thermometerId?: string | null
  dataloggerId?: string | null
  calibrationDueDate?: string | null
  availabilityStatus?: EnvUnitAvailabilityStatus
  unavailableFrom?: string | null
  unavailableUntil?: string | null
  unavailableNote?: string | null
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
  if (patch.readingsPerDay !== undefined) update.readings_per_day = normalizeEnvReadingsPerDay(Number(patch.readingsPerDay ?? 1))
  if (patch.trackHumidity !== undefined) update.track_humidity = Boolean(patch.trackHumidity)
  if (patch.humidityMinLimit !== undefined) update.humidity_min_limit = patch.humidityMinLimit
  if (patch.humidityMaxLimit !== undefined) update.humidity_max_limit = patch.humidityMaxLimit
  if (patch.thermometerId !== undefined) update.thermometer_id = clean(patch.thermometerId)
  if (patch.dataloggerId !== undefined) update.datalogger_id = clean(patch.dataloggerId)
  if (patch.calibrationDueDate !== undefined) update.calibration_due_date = patch.calibrationDueDate || null
  if (patch.availabilityStatus !== undefined) update.availability_status = patch.availabilityStatus
  if (patch.unavailableFrom !== undefined) update.unavailable_from = patch.unavailableFrom || null
  if (patch.unavailableUntil !== undefined) update.unavailable_until = patch.unavailableUntil || null
  if (patch.unavailableNote !== undefined) update.unavailable_note = clean(patch.unavailableNote)
  if (patch.isActive !== undefined) update.is_active = patch.isActive
  const admin = getAdminClient()
  const { data, error } = await admin.from('env_monitored_units').update(update).eq('id', id).select('*').single()
  if (error) throw new HttpError(400, error.message || 'Could not update unit')
  const locations = await loadStockLocations()
  const updated = mapUnit(data as RecordRow, locationMap(locations))
  await writeAudit(actor, 'env.unit.update', 'env-unit', id, { patch })
  return updated
}

export async function deleteUnit(id: string, actor: BmActor): Promise<void> {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { count, error: countError } = await admin
    .from('env_readings')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', id)
  fail(countError)
  if ((count ?? 0) > 0) {
    throw new HttpError(409, 'ตู้นี้มีประวัติการบันทึกอุณหภูมิแล้ว ให้ปิดใช้งานแทนการลบ')
  }

  const { error } = await admin.from('env_monitored_units').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'env.unit.delete', 'env-unit', id, {})
}

export async function reviewMonthlyReport(input: { unitId: string; yearMonth: string; note?: string | null }, actor: BmActor): Promise<EnvMonthlyReview> {
  assertAdmin(actor)
  const reviewMonth = input.yearMonth.trim()
  assertYearMonth(reviewMonth)
  const admin = getAdminClient()
  const { data: unitRow, error: unitError } = await admin.from('env_monitored_units').select('id,code').eq('id', input.unitId).maybeSingle()
  fail(unitError)
  if (!unitRow) throw new HttpError(404, 'Temperature unit not found')
  await assertNoOpenCorrectiveActions(input.unitId, reviewMonth)

  const reviewedAt = new Date().toISOString()
  const { data, error } = await admin
    .from('env_monthly_reviews')
    .upsert({
      unit_id: input.unitId,
      year_month: reviewMonth,
      note: clean(input.note),
      reviewed_by: actor.id,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    }, { onConflict: 'unit_id,year_month' })
    .select('*')
    .single()
  if (error) throw new HttpError(400, error.message || 'Could not review month')
  const review = mapMonthlyReview(data as RecordRow, new Map([[actor.id, actor.displayName]]))
  await writeAudit(actor, 'env.monthly-review.lock', 'env-monthly-review', review.id, { unitId: input.unitId, yearMonth: reviewMonth })
  return review
}

export async function unlockMonthlyReport(input: { unitId: string; yearMonth: string }, actor: BmActor): Promise<void> {
  assertAdmin(actor)
  const reviewMonth = input.yearMonth.trim()
  assertYearMonth(reviewMonth)
  const { error } = await getAdminClient()
    .from('env_monthly_reviews')
    .delete()
    .eq('unit_id', input.unitId)
    .eq('year_month', reviewMonth)
  fail(error)
  await writeAudit(actor, 'env.monthly-review.unlock', 'env-monthly-review', `${input.unitId}:${reviewMonth}`, { unitId: input.unitId, yearMonth: reviewMonth })
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
  const { data: readingRow, error: readingError } = await admin.from('env_readings').select('unit_id,reading_date').eq('id', input.readingId).maybeSingle()
  fail(readingError)
  if (!readingRow) throw new HttpError(404, 'Reading not found')
  await assertMonthUnlocked(asString((readingRow as RecordRow).unit_id), yearMonth(asString((readingRow as RecordRow).reading_date)))
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
  const { data: current, error: currentError } = await admin
    .from('env_corrective_actions')
    .select('reading_id, env_readings(unit_id, reading_date)')
    .eq('id', id)
    .maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'Corrective action not found')
  const reading = (current as RecordRow).env_readings as RecordRow | null
  if (reading) await assertMonthUnlocked(asString(reading.unit_id), yearMonth(asString(reading.reading_date)))
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
