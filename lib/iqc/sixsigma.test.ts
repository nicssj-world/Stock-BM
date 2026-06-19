import { describe, expect, it } from 'vitest'
import { sigmaRating, sixSigma, teaPercent } from '@/lib/iqc/sixsigma'

describe('teaPercent', () => {
  it('returns percent specs unchanged', () => {
    expect(teaPercent(12, 'percent', 5)).toBe(12)
  })
  it('converts absolute TEa to percent of mean (VL log10 example)', () => {
    // HIV TEa 0.5 log10 at a control mean of 3.0 log10 -> 16.67%
    expect(teaPercent(0.5, 'absolute', 3)).toBeCloseTo(16.667, 2)
  })
  it('guards a zero mean', () => {
    expect(teaPercent(0.5, 'absolute', 0)).toBeNull()
  })
})

describe('sixSigma', () => {
  it('computes (TEa% - |bias%|) / CV%', () => {
    expect(sixSigma(16.67, 1.67, 3)).toBeCloseTo(5, 2)
  })
  it('uses absolute bias', () => {
    expect(sixSigma(20, -5, 5)).toBeCloseTo(3, 5)
  })
  it('guards non-positive CV', () => {
    expect(sixSigma(20, 0, 0)).toBeNull()
  })
})

describe('sigmaRating', () => {
  it('bands sigma values', () => {
    expect(sigmaRating(6.5)).toBe('world-class')
    expect(sigmaRating(4.2)).toBe('good')
    expect(sigmaRating(3.1)).toBe('marginal')
    expect(sigmaRating(2.0)).toBe('poor')
    expect(sigmaRating(null)).toBe('unknown')
  })
})
