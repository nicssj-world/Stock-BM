export type EnvUnitKind = 'fridge' | 'freezer' | 'room' | 'incubator' | 'other'
export type EnvReadingStatus = 'in-range' | 'out-of-range' | 'corrected'
// Derived status for a unit card: today's reading status, or pending when not logged.
export type EnvCardStatus = 'in-range' | 'out-of-range' | 'corrected' | 'pending'

export interface EnvUnit {
  id: string
  code: string
  name: string
  kind: EnvUnitKind
  locationId: string | null
  locationName: string | null
  qrToken: string
  minLimit: number | null
  maxLimit: number | null
  unit: string
  readingsPerDay: number
  isActive: boolean
}

export interface EnvReading {
  id: string
  unitId: string
  readingDate: string
  readingValue: number
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
  value: number
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

// One dashboard card per monitored unit.
export interface EnvUnitCard {
  unit: EnvUnit
  todayReading: EnvReading | null
  todayReadingCount: number
  loggedToday: boolean
  lastReading: EnvReading | null
  status: EnvCardStatus
  points: EnvReadingPoint[]
  openCorrectiveActions: number
}

export interface EnvWorkspace {
  units: EnvUnit[]
  cards: EnvUnitCard[]
  readings: EnvReading[]
  correctiveActions: EnvCorrectiveAction[]
  today: string
  summary: {
    unitCount: number
    loggedToday: number
    pendingToday: number
    outOfRangeToday: number
    openCorrectiveActions: number
  }
}

export interface EnvDashboard {
  cards: Array<Pick<EnvUnitCard, 'unit' | 'todayReading' | 'todayReadingCount' | 'loggedToday' | 'lastReading' | 'status' | 'openCorrectiveActions'>>
  summary: EnvWorkspace['summary']
}

// How many recent readings each unit card carries for the mini trend chart.
export const ENV_TREND_POINTS = 30
