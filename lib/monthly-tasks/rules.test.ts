import { describe, expect, it } from 'vitest'
import { addMonths, daysInMonth, dueDateForMonth, isMonthKey, monthStart } from '@/lib/monthly-tasks/rules'

describe('monthly task calendar rules', () => {
  it('validates and normalizes month keys', () => {
    expect(isMonthKey('2026-10')).toBe(true)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(monthStart('2026-10')).toBe('2026-10-01')
  })

  it('clamps a recurring deadline to the last day of short months', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(dueDateForMonth('2026-02', 31)).toBe('2026-02-28')
    expect(dueDateForMonth('2028-02', 31)).toBe('2028-02-29')
    expect(dueDateForMonth('2026-10', 31)).toBe('2026-10-31')
  })

  it('moves between months without local timezone drift', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-10', 12)).toBe('2027-10')
  })
})
