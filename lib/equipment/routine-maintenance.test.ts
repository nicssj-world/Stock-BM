import { describe, expect, it } from 'vitest'
import {
  generateRoutineOccurrences,
  routineOccurrenceForPlannedDate,
  routinePeriodBounds,
  routinePeriodFor,
  type RoutineMaintenanceVersion,
} from './routine-maintenance'

function version(frequency: RoutineMaintenanceVersion['frequency'], startsOn: string): RoutineMaintenanceVersion {
  return {
    id: `${frequency}-version`,
    formId: 'form-1',
    versionNumber: 1,
    frequency,
    startsOn,
    effectiveOn: startsOn,
    items: [],
  }
}

describe('generic routine maintenance schedule', () => {
  it('skips weekends for daily schedules and shifts holidays forward', () => {
    const occurrences = generateRoutineOccurrences(
      version('daily', '2026-08-28'),
      '2026-08-28',
      '2026-09-01',
      new Set(['2026-08-31']),
    )

    expect(occurrences.map((item) => [item.plannedOn, item.scheduledOn])).toEqual([
      ['2026-08-28', '2026-08-28'],
      ['2026-08-31', '2026-09-01'],
      ['2026-09-01', '2026-09-01'],
    ])
  })

  it('moves a weekly occurrence that starts on a weekend to Monday', () => {
    const [occurrence] = generateRoutineOccurrences(
      version('weekly', '2026-08-29'),
      '2026-08-29',
      '2026-08-31',
    )

    expect(occurrence).toMatchObject({ plannedOn: '2026-08-29', scheduledOn: '2026-08-31', shifted: true })
  })

  it('does not accept a weekend as a daily nominal occurrence', () => {
    expect(routineOccurrenceForPlannedDate(version('daily', '2026-08-28'), '2026-08-29')).toBeNull()
  })

  it('clamps monthly dates to the last day without losing the original anchor', () => {
    const occurrences = generateRoutineOccurrences(
      version('monthly', '2025-01-31'),
      '2025-01-01',
      '2025-04-30',
    )

    expect(occurrences.map((item) => item.plannedOn)).toEqual([
      '2025-01-31',
      '2025-02-28',
      '2025-03-31',
      '2025-04-30',
    ])
  })

  it('handles leap-day yearly schedules in both leap and non-leap years', () => {
    const occurrences = generateRoutineOccurrences(
      version('yearly', '2024-02-29'),
      '2024-01-01',
      '2028-03-01',
    )

    expect(occurrences.map((item) => item.plannedOn)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ])
  })

  it('derives review periods from the nominal maintenance date', () => {
    expect(routinePeriodFor('daily', '2026-08-31')).toBe('2026-08')
    expect(routinePeriodFor('weekly', '2026-08-31')).toBe('2026-08')
    expect(routinePeriodFor('monthly', '2026-08-31')).toBe('2026')
    expect(routinePeriodFor('yearly', '2026-08-31')).toBe('2026')
    expect(routinePeriodBounds('daily', '2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(routinePeriodBounds('yearly', '2024')).toEqual({ from: '2024-01-01', to: '2024-12-31' })
  })

  it('resolves a logged date with the exact calculated shifted date', () => {
    const occurrence = routineOccurrenceForPlannedDate(
      version('monthly', '2026-08-31'),
      '2026-08-31',
      new Set(['2026-08-31']),
    )

    expect(occurrence).toMatchObject({ plannedOn: '2026-08-31', scheduledOn: '2026-09-01' })
  })

  it('keeps a nominal occurrence when its shifted work date crosses the range end', () => {
    const occurrences = generateRoutineOccurrences(
      version('monthly', '2026-08-31'),
      '2026-08-01',
      '2026-08-31',
      new Set(['2026-08-31']),
    )

    expect(occurrences).toMatchObject([
      { plannedOn: '2026-08-31', scheduledOn: '2026-09-01', shifted: true },
    ])
  })
})
