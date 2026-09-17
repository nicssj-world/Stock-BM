import { describe, expect, it } from 'vitest'
import { TOR_THRESHOLD_MONTHS, addCalendarMonths, remainingShelfLife, torExpiryCompliance } from '@/lib/bm/shelf-life'

const fixtures = [
  ['2027-10-15', '2028-04-15', 'not_compliant'],
  ['2027-10-15', '2028-04-16', 'compliant'],
  ['2027-10-15', '2028-04-14', 'not_compliant'],
  ['2026-08-31', '2027-02-28', 'not_compliant'],
  ['2026-08-31', '2027-03-01', 'compliant'],
  ['2026-08-29', '2027-02-28', 'not_compliant'],
  ['2027-08-29', '2028-02-29', 'not_compliant'],
  ['2027-08-31', '2028-02-29', 'not_compliant'],
  ['2027-12-31', '2028-06-30', 'not_compliant'],
  ['2027-12-31', '2028-07-01', 'compliant'],
] as const

describe('global TOR shelf-life', () => {
  it('keeps the threshold global and fixed at six calendar months', () => {
    expect(TOR_THRESHOLD_MONTHS).toBe(6)
  })

  it.each(fixtures)('%s received, %s expiry => %s', (received, expiry, expected) => {
    expect(torExpiryCompliance(expiry, received)).toBe(expected)
  })

  it('uses not_applicable for an absent expiry and does not count it as a KPI failure', () => {
    expect(torExpiryCompliance(null, '2027-10-15')).toBe('not_applicable')
  })

  it('clamps month ends and computes date-only remaining shelf life', () => {
    expect(addCalendarMonths('2026-08-31', TOR_THRESHOLD_MONTHS)).toBe('2027-02-28')
    expect(remainingShelfLife('2028-04-15', '2027-10-15')).toBe(183)
    expect(remainingShelfLife(null, '2027-10-15')).toBeNull()
  })
})
