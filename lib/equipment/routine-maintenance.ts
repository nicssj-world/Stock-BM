import type { BmActor } from '@/lib/bm/types'

export const ROUTINE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type RoutineFrequency = (typeof ROUTINE_FREQUENCIES)[number]

export const ROUTINE_TASK_STATES = ['done', 'not-applicable', 'not-done'] as const
export type RoutineTaskState = (typeof ROUTINE_TASK_STATES)[number]

export const ROUTINE_SOURCES = ['internal', 'qr'] as const
export type RoutineSource = (typeof ROUTINE_SOURCES)[number]

export type RoutineTaskResult = {
  itemId: string
  label: string
  state: RoutineTaskState
}

export type RoutineMaintenanceItem = {
  id: string
  position: number
  label: string
}

export type RoutineMaintenanceVersion = {
  id: string
  formId: string
  versionNumber: number
  frequency: RoutineFrequency
  startsOn: string
  effectiveOn: string
  items: RoutineMaintenanceItem[]
}

export type RoutineMaintenanceForm = {
  id: string
  equipmentId: string
  name: string
  active: boolean
  reviewerId: string | null
  versions: RoutineMaintenanceVersion[]
}

export type RoutineMaintenanceEntry = {
  id: string
  equipmentId: string
  formId: string
  versionId: string
  frequency: RoutineFrequency
  plannedOn: string
  scheduledOn: string
  taskResults: RoutineTaskResult[]
  note: string | null
  operatorId: string
  operatorName: string
  operatorCode: string
  source: RoutineSource
  createdAt: string
}

export type RoutineMaintenanceHoliday = {
  id: string
  formId: string
  date: string
  note: string | null
}

export type RoutineMaintenanceReview = {
  id: string
  formId: string
  frequency: RoutineFrequency
  periodKind: 'month' | 'year'
  period: string
  reviewedByName: string
  reviewedAt: string
}

export type RoutineMaintenanceWorkspace = {
  equipment: { id: string; code: string; name: string; qrToken: string } | null
  forms: RoutineMaintenanceForm[]
  entries: RoutineMaintenanceEntry[]
  holidays: RoutineMaintenanceHoliday[]
  reviews: RoutineMaintenanceReview[]
  users: { id: string; displayName: string }[]
  today: string
}

export type RoutineMaintenanceOccurrence = {
  key: string
  formId: string
  versionId: string
  frequency: RoutineFrequency
  plannedOn: string
  scheduledOn: string
  shifted: boolean
}

export type RoutineReviewPeriod = {
  frequency: RoutineFrequency
  period: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function formatDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function utcDate(value: string) {
  const { year, month, day } = parseDate(value)
  return new Date(Date.UTC(year, month - 1, day))
}

function dateKey(value: Date) {
  return formatDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addRoutineDays(value: string, days: number) {
  return dateKey(new Date(utcDate(value).getTime() + days * DAY_MS))
}

function isWeekend(value: string) {
  const day = utcDate(value).getUTCDay()
  return day === 0 || day === 6
}

function monthlyAnchorDate(start: string, occurrenceIndex: number) {
  const { year, month, day } = parseDate(start)
  const absoluteMonth = year * 12 + (month - 1) + occurrenceIndex
  const targetYear = Math.floor(absoluteMonth / 12)
  const targetMonth = (absoluteMonth % 12) + 1
  return formatDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)))
}

function yearlyAnchorDate(start: string, occurrenceIndex: number) {
  const { year, month, day } = parseDate(start)
  return formatDate(year + occurrenceIndex, month, Math.min(day, daysInMonth(year + occurrenceIndex, month)))
}

export function addRoutineFrequency(value: string, frequency: RoutineFrequency) {
  if (frequency === 'daily') return addRoutineDays(value, 1)
  if (frequency === 'weekly') return addRoutineDays(value, 7)
  if (frequency === 'monthly') return monthlyAnchorDate(value, 1)
  return yearlyAnchorDate(value, 1)
}

export function occurrenceAtIndex(start: string, frequency: RoutineFrequency, index: number) {
  if (frequency === 'daily') return addRoutineDays(start, index)
  if (frequency === 'weekly') return addRoutineDays(start, index * 7)
  if (frequency === 'monthly') return monthlyAnchorDate(start, index)
  return yearlyAnchorDate(start, index)
}

function nextWorkingDay(value: string, holidays: ReadonlySet<string>) {
  let candidate = value
  for (let index = 0; index < 3660; index += 1) {
    if (!isWeekend(candidate) && !holidays.has(candidate)) return candidate
    candidate = addRoutineDays(candidate, 1)
  }
  throw new Error('Unable to find the next working day')
}

export function routinePeriodKind(frequency: RoutineFrequency): 'month' | 'year' {
  return frequency === 'daily' || frequency === 'weekly' ? 'month' : 'year'
}

export function routinePeriodFor(frequency: RoutineFrequency, date: string) {
  return routinePeriodKind(frequency) === 'month' ? date.slice(0, 7) : date.slice(0, 4)
}

export function routinePeriodBounds(frequency: RoutineFrequency, period: string) {
  if (routinePeriodKind(frequency) === 'month') {
    const start = `${period.slice(0, 7)}-01`
    const nextMonth = addRoutineDays(monthlyAnchorDate(start, 1), -1)
    return { from: start, to: nextMonth }
  }
  const start = `${period.slice(0, 4)}-01-01`
  const nextYear = `${String(Number(period.slice(0, 4)) + 1).padStart(4, '0')}-01-01`
  return { from: start, to: addRoutineDays(nextYear, -1) }
}

function nextRoutineReviewPeriod(period: string, kind: 'month' | 'year') {
  if (kind === 'month') return monthlyAnchorDate(`${period}-01`, 1).slice(0, 7)
  return String(Number(period) + 1).padStart(4, '0')
}

/**
 * Returns every calendar period that a form can be reviewed through today.
 * Review is a period-level action, so it must remain available even when a
 * period has no logged occurrence yet (for example, an empty August record).
 */
export function routineReviewPeriods(form: RoutineMaintenanceForm, today: string): RoutineReviewPeriod[] {
  const periods = new Map<string, RoutineReviewPeriod>()
  for (const version of form.versions) {
    const kind = routinePeriodKind(version.frequency)
    const first = routinePeriodFor(version.frequency, version.startsOn)
    const last = routinePeriodFor(version.frequency, today)
    if (first > last) continue
    let period = first
    for (let index = 0; period <= last && index < 2400; index += 1) {
      const key = `${version.frequency}:${period}`
      periods.set(key, { frequency: version.frequency, period })
      period = nextRoutineReviewPeriod(period, kind)
    }
  }
  return [...periods.values()].sort((a, b) => b.period.localeCompare(a.period) || a.frequency.localeCompare(b.frequency))
}

export function frequencyLabel(frequency: RoutineFrequency) {
  return frequency[0].toUpperCase() + frequency.slice(1)
}

export function actorCanBackfill(actor: Pick<BmActor, 'role'>) {
  return actor.role === 'Admin'
}

export function generateRoutineOccurrences(
  version: RoutineMaintenanceVersion,
  from: string,
  to: string,
  holidays: ReadonlySet<string> = new Set(),
): RoutineMaintenanceOccurrence[] {
  if (to < from || to < version.startsOn) return []
  const searchFrom = from < version.startsOn ? version.startsOn : from
  const occurrences: RoutineMaintenanceOccurrence[] = []
  let index = 0
  let plannedOn = occurrenceAtIndex(version.startsOn, version.frequency, index)
  while (plannedOn <= to && index < 10000) {
    if (plannedOn >= searchFrom) {
      if (version.frequency !== 'daily' || !isWeekend(plannedOn)) {
        const scheduledOn = nextWorkingDay(plannedOn, holidays)
        // The report and the unique key are based on the nominal date. A
        // holiday at the end of a range may move the actual work date into
        // the next range, but the original occurrence must still be shown.
        if (plannedOn >= from && plannedOn <= to) {
          occurrences.push({
            key: `${version.id}:${plannedOn}`,
            formId: version.formId,
            versionId: version.id,
            frequency: version.frequency,
            plannedOn,
            scheduledOn,
            shifted: plannedOn !== scheduledOn,
          })
        }
      }
    }
    index += 1
    plannedOn = occurrenceAtIndex(version.startsOn, version.frequency, index)
  }
  return occurrences
}

export function generateFormOccurrences(
  form: RoutineMaintenanceForm,
  from: string,
  to: string,
  holidays: ReadonlySet<string> = new Set(),
) {
  const versions = [...form.versions].sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  return versions.flatMap((version, index) => {
    const nextVersion = versions[index + 1]
    const versionTo = nextVersion ? addRoutineDays(nextVersion.startsOn, -1) : to
    const end = versionTo < to ? versionTo : to
    return generateRoutineOccurrences(version, from, end, holidays)
  }).sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn) || a.plannedOn.localeCompare(b.plannedOn))
}

/**
 * Resolve one nominal schedule date using the same weekend/holiday rules as
 * the report generator. Keeping plannedOn separate from scheduledOn is
 * important when a maintenance date is moved to the next working day.
 */
export function routineOccurrenceForPlannedDate(
  version: RoutineMaintenanceVersion,
  plannedOn: string,
  holidays: ReadonlySet<string> = new Set(),
) {
  if (plannedOn < version.startsOn) return null
  let index = 0
  let candidate = occurrenceAtIndex(version.startsOn, version.frequency, index)
  while (candidate <= plannedOn && index < 10000) {
    if (candidate === plannedOn) {
      if (version.frequency === 'daily' && isWeekend(candidate)) return null
      const scheduledOn = nextWorkingDay(candidate, holidays)
      return {
        key: `${version.id}:${candidate}`,
        formId: version.formId,
        versionId: version.id,
        frequency: version.frequency,
        plannedOn: candidate,
        scheduledOn,
        shifted: candidate !== scheduledOn,
      } satisfies RoutineMaintenanceOccurrence
    }
    index += 1
    candidate = occurrenceAtIndex(version.startsOn, version.frequency, index)
  }
  return null
}

export function currentRoutineVersion(form: RoutineMaintenanceForm, today: string) {
  return [...form.versions]
    .filter((version) => version.startsOn <= today)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0] ?? form.versions[0] ?? null
}
