import { describe, expect, it } from 'vitest'
import { formatThaiDate, formatThaiDateTime, formatThaiMonthYear, toBuddhistYear } from '@/lib/bm/thai-date'

const eqaReportDate = (value: string) => new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
}).format(new Date(value))

describe('shared Thai Buddhist Era date helpers', () => {
  it.each([
    '2026-01-01T00:00:00.000Z',
    '2026-08-23T03:00:00.000Z',
    '2027-12-31T16:59:59.000Z',
  ])('matches the EQA report formatter for %s', (value) => {
    expect(formatThaiDate(value)).toBe(eqaReportDate(value))
  })

  it('treats ISO date-only values as Bangkok dates and handles empty input', () => {
    expect(formatThaiDate('2026-01-01')).toBe(eqaReportDate('2026-01-01'))
    expect(formatThaiDate(null)).toBe('-')
    expect(formatThaiDate('not-a-date')).toBe('-')
  })

  it('formats Buddhist date-time and month-year values from one locale contract', () => {
    expect(formatThaiDateTime('2026-08-23T03:00:00.000Z')).toContain('2569')
    expect(formatThaiDateTime('2026-08-23T03:00:00.000Z')).toContain('10:00')
    expect(formatThaiMonthYear('2026-08-23')).toBe('สิงหาคม 2569')
    expect(formatThaiMonthYear(null)).toBe('-')
  })

  it('converts a Gregorian year without date or timezone arithmetic', () => {
    expect(toBuddhistYear(2026)).toBe(2569)
  })
})
