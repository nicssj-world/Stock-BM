import { describe, expect, it } from 'vitest'
import { difference, meanPercentBias, percentDiff, withinCriteria, calculateParallelComparison } from '@/lib/lotverif/compare'

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

  it('calculates the parallel index from the populated control levels', () => {
    const result = calculateParallelComparison({
      scale: 'linear',
      rows: [
        { level: 1, controlMean: 47.8, controlSd: 1.7, oldRun1: 47.78, newRun1: 46.89 },
        { level: 2, controlMean: 12.2, controlSd: 2, oldRun1: 11.21, newRun1: 11.8 },
        { level: 3, controlMean: null, controlSd: null, oldRun1: null, newRun1: null },
      ],
    })

    expect(result.currentMean).toBeCloseTo(29.495)
    expect(result.newMean).toBeCloseTo(29.345)
    expect(result.allSampleMean).toBeCloseTo(29.42)
    expect(result.selectedLevel).toBe(2)
    expect(result.signedIndex).toBeCloseTo(0.0311012916)
    expect(result.index).toBeCloseTo(0.0311012916)
    expect(result.passed).toBe(true)
  })

  it('uses absolute index for the decision when the new lot shifts upward', () => {
    const result = calculateParallelComparison({
      scale: 'linear',
      rows: [
        { level: 1, controlMean: 100, controlSd: 1, oldRun1: 100, newRun1: 110 },
        { level: 2, controlMean: 200, controlSd: 2, oldRun1: 200, newRun1: 220 },
      ],
    })

    expect(result.signedIndex).toBeLessThan(-1)
    expect(result.index).toBeGreaterThan(1)
    expect(result.passed).toBe(false)
  })

  it('converts raw viral-load results to log10 before calculating', () => {
    const result = calculateParallelComparison({
      scale: 'log10',
      rows: [
        { level: 1, controlMean: 4, controlSd: 0.2, oldRun1: 10_000, newRun1: 12_589.254 },
        { level: 2, controlMean: 5, controlSd: 0.2, oldRun1: 100_000, newRun1: 125_892.54 },
      ],
    })

    expect(result.currentMean).toBeCloseTo(4.5)
    expect(result.newMean).toBeCloseTo(4.6, 3)
    expect(result.allSampleMean).toBeCloseTo(4.55, 3)
    expect(result.selectedLevel).toBe(2)
    expect(result.passed).toBe(true)
  })

  it('does not evaluate a parallel result with fewer than two populated levels', () => {
    const result = calculateParallelComparison({
      scale: 'linear',
      rows: [{ level: 1, controlMean: 100, controlSd: 1, oldRun1: 100, newRun1: 101 }],
    })

    expect(result.passed).toBeNull()
    expect(result.reason).toBe('insufficient-levels')
  })
})
