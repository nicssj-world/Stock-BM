import { describe, expect, it } from 'vitest'
import {
  combinedRelative,
  divisorFor,
  expandedRelative,
  expandedUncertaintyOfResult,
  pooledRsd,
  relativeStandardUncertainty,
  standardUncertainty,
} from '@/lib/iqc/uncertainty'

describe('divisorFor', () => {
  it('maps distributions to divisors', () => {
    expect(divisorFor('normal')).toBe(1)
    expect(divisorFor('normal-k2')).toBe(2)
    expect(divisorFor('rectangular')).toBeCloseTo(Math.sqrt(3), 6)
    expect(divisorFor('triangular')).toBeCloseTo(Math.sqrt(6), 6)
    expect(divisorFor('u-shape')).toBeCloseTo(Math.sqrt(2), 6)
  })
})

describe('standard / relative uncertainty', () => {
  it('IQC SU = SD (divisor 1) and RSU = SD/mean = CV', () => {
    const su = standardUncertainty(0.4, 1)
    expect(su).toBe(0.4)
    expect(relativeStandardUncertainty(su, 11.55)).toBeCloseTo(0.0346, 4) // ~3.46% = CV
  })
  it('calibrator at 95% (divisor 2)', () => {
    expect(standardUncertainty(2, 2)).toBe(1)
  })
})

describe('pooledRsd (RMS across lots)', () => {
  it('combines per-lot RSDs', () => {
    expect(pooledRsd([3, 4])).toBeCloseTo(Math.sqrt((9 + 16) / 2), 6)
  })
  it('single lot returns itself', () => {
    expect(pooledRsd([3.4])).toBeCloseTo(3.4, 6)
  })
})

describe('combine / expand', () => {
  it('UC = sqrt(sum RSU^2), UX = k*UC', () => {
    const uc = combinedRelative([0.03, 0.04])
    expect(uc).toBeCloseTo(0.05, 6)
    expect(expandedRelative(uc, 2)).toBeCloseTo(0.1, 6)
  })
  it('UR = result * UX', () => {
    expect(expandedUncertaintyOfResult(167.6, 0.1)).toBeCloseTo(16.76, 2)
  })
})
