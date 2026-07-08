import type { StockLocation } from '@/lib/bm/types'

export type EnvUnitKind = 'fridge' | 'freezer' | 'room' | 'incubator' | 'other'
export type EnvReadingStatus = 'in-range' | 'out-of-range' | 'corrected'
export type EnvUnitAvailabilityStatus = 'active' | 'maintenance' | 'paused'
// Derived status for a unit card: today's reading status, or pending when not logged.
export type EnvCardStatus = 'in-range' | 'out-of-range' | 'corrected' | 'pending' | 'unavailable'
export type EnvPeriodIndex = 1 | 2 | 3

export const ENV_PERIOD_LABELS: Record<EnvPeriodIndex, string> = {
  1: 'เวรเช้า (08:00-16:00)',
  2: 'เวรบ่าย (16:00-24:00)',
  3: 'เวรดึก (24:00-08:00)',
}

export function normalizeEnvReadingsPerDay(value: number) {
  if (value >= 3) return 3
  if (value >= 2) return 2
  return 1
}

export function envPeriodOptions(readingsPerDay: number) {
  const count = normalizeEnvReadingsPerDay(readingsPerDay)
  return Array.from({ length: count }, (_, index) => {
    const periodIndex = (index + 1) as EnvPeriodIndex
    return { periodIndex, label: ENV_PERIOD_LABELS[periodIndex] }
  })
}

export function envPeriodLabel(periodIndex: number) {
  return ENV_PERIOD_LABELS[(periodIndex as EnvPeriodIndex)] ?? `รอบที่ ${periodIndex}`
}

export interface EnvUnit {
  id: string
  code: string
  name: string
  kind: EnvUnitKind
  locationId: string | null
  locationCode: string | null
  locationName: string | null
  qrToken: string
  minLimit: number | null
  maxLimit: number | null
  unit: string
  readingsPerDay: number
  trackHumidity: boolean
  humidityMinLimit: number | null
  humidityMaxLimit: number | null
  thermometerId: string | null
  dataloggerId: string | null
  calibrationDueDate: string | null
  availabilityStatus: EnvUnitAvailabilityStatus
  unavailableFrom: string | null
  unavailableUntil: string | null
  unavailableNote: string | null
  isActive: boolean
}

export interface EnvReading {
  id: string
  unitId: string
  readingDate: string
  periodIndex: EnvPeriodIndex
  periodLabel: string
  readingValue: number
  humidityPercent: number | null
  recordedMin: number | null
  recordedMax: number | null
  status: EnvReadingStatus
  isVoided: boolean
  voidReason: string | null
  note: string | null
  recordedByName: string | null
  createdAt: string
}

export interface EnvReadingPoint {
  id: string
  readingDate: string
  periodIndex: EnvPeriodIndex
  value: number
  humidityValue?: number | null
  status: EnvReadingStatus
  isVoided: boolean
}

export interface EnvCorrectiveAction {
  id: string
  readingId: string
  unitId: string
  unitName: string
  readingDate: string
  problem: string
  rootCause: string | null
  actionTaken: string | null
  status: 'open' | 'closed'
  createdByName: string | null
  createdAt: string
  closedByName: string | null
  closedAt: string | null
}

export interface EnvMonthlyReview {
  id: string
  unitId: string
  yearMonth: string
  note: string | null
  reviewedByName: string | null
  reviewedAt: string
}

// One dashboard card per monitored unit.
export interface EnvUnitCard {
  unit: EnvUnit
  todayReading: EnvReading | null
  todayReadingCount: number
  todayPeriodIndexes: EnvPeriodIndex[]
  missingPeriodIndexes: EnvPeriodIndex[]
  duePeriodIndexes: EnvPeriodIndex[]
  loggedToday: boolean
  lastReading: EnvReading | null
  status: EnvCardStatus
  points: EnvReadingPoint[]
  openCorrectiveActions: number
}

export interface EnvWorkspace {
  locations: StockLocation[]
  units: EnvUnit[]
  cards: EnvUnitCard[]
  readings: EnvReading[]
  correctiveActions: EnvCorrectiveAction[]
  monthlyReviews: EnvMonthlyReview[]
  today: string
  summary: {
    unitCount: number
    loggedToday: number
    pendingToday: number
    dueNowCount: number
    dueNowPeriodCount: number
    outOfRangeToday: number
    openCorrectiveActions: number
  }
}

export interface EnvDashboard {
  cards: Array<Pick<EnvUnitCard, 'unit' | 'todayReading' | 'todayReadingCount' | 'todayPeriodIndexes' | 'missingPeriodIndexes' | 'duePeriodIndexes' | 'loggedToday' | 'lastReading' | 'status' | 'openCorrectiveActions'>>
  summary: EnvWorkspace['summary']
}

// How many recent readings each unit card carries for the mini trend chart.
export const ENV_TREND_POINTS = 30
