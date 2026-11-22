import { describe, expect, it } from 'vitest'
import { chiSquareQuantile, linearityVerification, lodVerification, normalQuantile, parseGrid, precisionLevel } from '@/lib/methodverif/stats'

const days = [['10', '11', '12'], ['11', '12', '13'], ['9', '10', '11'], ['10', '10', '10'], ['12', '12', '12']]

describe('distribution helpers', () => {
  it('approximates normal and chi-square quantiles', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.96, 3)
    expect(chiSquareQuantile(0.95, 10)).toBeCloseTo(18.307, 1)
    expect(chiSquareQuantile(0.95, 4)).toBeCloseTo(9.488, 0)
  })
})

describe('precisionLevel (EP15-A3 ANOVA)', () => {
  it('computes repeatability and within-lab SD from days × replicates', () => {
    const result = precisionLevel({ label: 'L1', claimRepeatability: 10, claimWithinLab: 15, values: days }, 'linear', 1)
    expect(result.days).toBe(5)
    expect(result.replicates).toBe(3)
    expect(result.mean).toBe(11)
    expect(result.repeatability).toBeCloseTo(0.7746, 3)
    expect(result.withinLab).toBeCloseTo(1.1832, 3)
    expect(result.repeatabilityDf).toBe(10)
    expect(result.withinLabDf).toBeCloseTo(7.4, 1)
    expect(result.repeatabilityCv).toBeCloseTo(7.04, 1)
    expect(result.verdict).toBe('passed')
  })

  it('fails when the observed SD exceeds the upper verification limit', () => {
    const result = precisionLevel({ label: 'L1', claimRepeatability: 2, claimWithinLab: 3, values: days }, 'linear', 1)
    expect(result.verdict).toBe('failed')
  })

  it('works on log10 values for viral load and treats claims as log SD', () => {
    const vl = [['1000', '1100'], ['950', '1050'], ['1000', '1000'], ['1200', '1150'], ['900', '980']]
    const result = precisionLevel({ label: 'LPC', claimRepeatability: 0.1, claimWithinLab: 0.15, values: vl }, 'log10', 2)
    expect(result.mean).toBeCloseTo(3.017, 2)
    expect(result.repeatabilityCv).toBeNull()
    expect(result.verdict).toBe('insufficient') // only 2 replicates per day
  })

  it('needs a manufacturer claim to decide', () => {
    const result = precisionLevel({ label: 'L1', claimRepeatability: null, claimWithinLab: null, values: days }, 'linear', 1)
    expect(result.verdict).toBe('insufficient')
  })
})

describe('lodVerification (EP17)', () => {
  it('passes when the detection rate reaches the criterion', () => {
    const values = [...Array(19).fill('<20'), 'Target Not Detected']
    const result = lodVerification({ claimedLod: 20, minReplicates: 20, minDetectPercent: 95, values })
    expect(result.detected).toBe(19)
    expect(result.detectPercent).toBe(95)
    expect(result.verdict).toBe('passed')
  })

  it('fails below the criterion and waits for enough replicates', () => {
    const values = [...Array(17).fill('25'), ...Array(3).fill('Not detected')]
    expect(lodVerification({ claimedLod: 20, minReplicates: 20, minDetectPercent: 95, values }).verdict).toBe('failed')
    expect(lodVerification({ claimedLod: 20, minReplicates: 20, minDetectPercent: 95, values: values.slice(0, 10) }).verdict).toBe('insufficient')
  })
})

describe('linearityVerification (EP06)', () => {
  it('computes log deviation per level and the regression', () => {
    const points = [100, 1000, 10000, 100000, 1000000].map((expected) => ({ expected, values: [String(expected * 1.1), String(expected * 0.95)] }))
    const result = linearityVerification(points, 'log10', 0.3)
    expect(result.points[0].deviation).toBeCloseTo(0.0095, 3)
    expect(result.slope).toBeCloseTo(1, 3)
    expect(result.verdict).toBe('passed')
  })

  it('flags a level outside the limit', () => {
    const points = [100, 1000, 10000, 100000, 1000000].map((expected, index) => ({ expected, values: [String(index === 4 ? expected * 3 : expected)] }))
    expect(linearityVerification(points, 'log10', 0.3).verdict).toBe('failed')
  })
})

describe('parseGrid', () => {
  it('splits Excel rows by tab', () => {
    expect(parseGrid('1\t2\t3\n\n4\t5\t6')).toEqual([['1', '2', '3'], ['4', '5', '6']])
  })
})
