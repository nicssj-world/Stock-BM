import { describe, expect, it } from 'vitest'
import {
  generateRoutineOccurrences,
  routineOccurrenceForPlannedDate,
  routinePeriodBounds,
  routinePeriodFor,
  routineReviewPeriods,
  routineUsesReviewLock,
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

  it('opens weekly maintenance on every calendar day without shifting weekends or holidays', () => {
    const occurrences = generateRoutineOccurrences(
      version('weekly', '2026-08-28'),
      '2026-08-28',
      '2026-09-01',
      new Set(['2026-08-31']),
    )

    expect(occurrences.map((occurrence) => [occurrence.plannedOn, occurrence.scheduledOn])).toEqual([
      ['2026-08-28', '2026-08-28'],
      ['2026-08-29', '2026-08-29'],
      ['2026-08-30', '2026-08-30'],
      ['2026-08-31', '2026-08-31'],
      ['2026-09-01', '2026-09-01'],
    ])
  })

  it('resolves any calendar date for weekly maintenance', () => {
    expect(routineOccurrenceForPlannedDate(version('weekly', '2026-08-28'), '2026-08-30', new Set(['2026-08-30']))).toMatchObject({
      plannedOn: '2026-08-30',
      scheduledOn: '2026-08-30',
      shifted: false,
    })
  })

  it('opens monthly maintenance on every calendar day without shifting holidays', () => {
    const occurrences = generateRoutineOccurrences(
      version('monthly', '2026-08-28'),
      '2026-08-28',
      '2026-08-31',
      new Set(['2026-08-31']),
    )

    expect(occurrences.map((occurrence) => [occurrence.plannedOn, occurrence.scheduledOn])).toEqual([
      ['2026-08-28', '2026-08-28'],
      ['2026-08-29', '2026-08-29'],
      ['2026-08-30', '2026-08-30'],
      ['2026-08-31', '2026-08-31'],
    ])
  })

  it('resolves any calendar date for monthly maintenance', () => {
    expect(routineOccurrenceForPlannedDate(version('monthly', '2026-08-28'), '2026-08-30', new Set(['2026-08-30']))).toMatchObject({
      plannedOn: '2026-08-30',
      scheduledOn: '2026-08-30',
      shifted: false,
    })
  })

  it('keeps weekly maintenance outside Review & Lock', () => {
    expect(routineUsesReviewLock('weekly')).toBe(false)
    expect(routineUsesReviewLock('monthly')).toBe(false)
    expect(routineUsesReviewLock('daily')).toBe(true)
  })

  it('does not accept a weekend as a daily nominal occurrence', () => {
    expect(routineOccurrenceForPlannedDate(version('daily', '2026-08-28'), '2026-08-29')).toBeNull()
  })

  it('continues opening monthly maintenance every day after the start date', () => {
    const occurrences = generateRoutineOccurrences(
      version('monthly', '2025-01-31'),
      '2025-01-29',
      '2025-02-02',
    )

    expect(occurrences.map((item) => item.plannedOn)).toEqual([
      '2025-01-31',
      '2025-02-01',
      '2025-02-02',
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
    expect(routinePeriodFor('monthly', '2026-08-31')).toBe('2026-08')
    expect(routinePeriodFor('yearly', '2026-08-31')).toBe('2026')
    expect(routinePeriodBounds('daily', '2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(routinePeriodBounds('monthly', '2026-08')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(routinePeriodBounds('yearly', '2024')).toEqual({ from: '2024-01-01', to: '2024-12-31' })
  })

  it('keeps previous and current calendar periods available for review lock', () => {
    const periods = routineReviewPeriods(
      {
        id: 'form-1',
        equipmentId: 'equipment-1',
        name: 'Daily',
        active: true,
        reviewerId: null,
        versions: [version('daily', '2026-07-15'), version('weekly', '2026-07-15')],
      },
      '2026-09-02',
    )

    expect(periods).toEqual([
      { frequency: 'daily', period: '2026-09' },
      { frequency: 'daily', period: '2026-08' },
      { frequency: 'daily', period: '2026-07' },
    ])
  })

  it('resolves a monthly date without shifting it', () => {
    const occurrence = routineOccurrenceForPlannedDate(
      version('monthly', '2026-08-31'),
      '2026-08-31',
      new Set(['2026-08-31']),
    )

    expect(occurrence).toMatchObject({ plannedOn: '2026-08-31', scheduledOn: '2026-08-31', shifted: false })
  })

  it('keeps a nominal occurrence when its shifted work date crosses the range end', () => {
    const occurrences = generateRoutineOccurrences(
      version('yearly', '2026-08-31'),
      '2026-08-01',
      '2026-08-31',
      new Set(['2026-08-31']),
    )

    expect(occurrences).toMatchObject([
      { plannedOn: '2026-08-31', scheduledOn: '2026-09-01', shifted: true },
    ])
  })
})
