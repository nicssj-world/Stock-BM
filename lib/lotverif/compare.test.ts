import { describe, expect, it } from 'vitest'
import { difference, meanPercentBias, percentDiff, withinCriteria } from '@/lib/lotverif/compare'

describe('lot-to-lot compare', () => {
  it('difference is new minus old', () => {
    expect(difference(100, 110)).toBe(10)
    expect(difference(110, 100)).toBe(-10)
  })

  it('percentDiff is signed relative to old', () => {
    expect(percentDiff(100, 110)).toBeCloseTo(10)
    expect(percentDiff(200, 150)).toBeCloseTo(-25)
  })

  it('percentDiff is NaN when old value is 0', () => {
    expect(Number.isNaN(percentDiff(0, 5))).toBe(true)
  })

  it('withinCriteria checks absolute percent against limit', () => {
    expect(withinCriteria(4.9, 5)).toBe(true)
    expect(withinCriteria(-4.9, 5)).toBe(true)
    expect(withinCriteria(6, 5)).toBe(false)
    expect(withinCriteria(Number.NaN, 5)).toBe(false)
  })

  it('meanPercentBias averages valid percents and skips undefined', () => {
    const bias = meanPercentBias([
      { oldValue: 100, newValue: 110 }, // +10
      { oldValue: 100, newValue: 90 }, // -10
      { oldValue: 0, newValue: 5 }, // skipped (NaN)
    ])
    expect(bias).toBeCloseTo(0)
  })

  it('meanPercentBias returns 0 when no valid pairs', () => {
    expect(meanPercentBias([{ oldValue: 0, newValue: 1 }])).toBe(0)
  })
})
