import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  addCalendarMonths,
  businessDaysElapsed,
  formatHivDrtPosition,
  getHivDrtDestructionState,
  getHivDrtTatState,
  HIV_DRT_RACK_CAPACITY,
  nextHivDrtRackPosition,
} from './rules'

describe('HIV DRT rack rules', () => {
  it('uses an 8 x 12 rack with A1-H12 coordinates', () => {
    expect(HIV_DRT_RACK_CAPACITY).toBe(96)
    expect(formatHivDrtPosition(1)).toBe('A1')
    expect(formatHivDrtPosition(96)).toBe('H12')
    expect(nextHivDrtRackPosition([1, 3], 4)).toBe(4)
    expect(nextHivDrtRackPosition([1, 3, 4], 4)).toBe(5)
    expect(nextHivDrtRackPosition([1, 3], 97)).toBeNull()
    expect(nextHivDrtRackPosition(Array.from({ length: 96 }, (_, index) => index + 1))).toBeNull()
  })
})

describe('HIV DRT TAT rules', () => {
  it('does not count checkout day or weekends', () => {
    expect(addBusinessDays('2026-07-17', 1)).toBe('2026-07-20')
    expect(businessDaysElapsed('2026-07-17', '2026-07-20')).toBe(1)
  })

  it('becomes overdue on business day 19, not on the weekend after day 18', () => {
    const due = addBusinessDays('2026-07-01', 18)
    expect(due).toBe('2026-07-27')
    expect(getHivDrtTatState('2026-07-01T03:00:00.000Z', 'checked_out', due)).toBe('waiting')
    expect(getHivDrtTatState('2026-07-01T03:00:00.000Z', 'checked_out', '2026-07-28')).toBe('overdue')
    expect(getHivDrtTatState('2026-07-01T03:00:00.000Z', 'result_received', '2026-08-20')).toBe('complete')
  })
})

describe('HIV DRT destruction rules', () => {
  it('adds three calendar months and clamps month-end dates', () => {
    expect(addCalendarMonths('2026-01-31', 3)).toBe('2026-04-30')
    expect(addCalendarMonths('2026-07-22', 3)).toBe('2026-10-22')
  })

  it('warns stored tubes 30 days before due and ignores checked-out tubes', () => {
    expect(getHivDrtDestructionState('2026-10-22', 'stored', '2026-09-22')).toBe('due_soon')
    expect(getHivDrtDestructionState('2026-10-22', 'stored', '2026-10-22')).toBe('due_now')
    expect(getHivDrtDestructionState('2026-10-22', 'checked_out', '2026-10-22')).toBe('none')
  })
})
