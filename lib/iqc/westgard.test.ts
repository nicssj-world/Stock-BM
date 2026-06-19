import { describe, expect, it } from 'vitest'
import { cv, evaluateWestgard, mean, sd, toStat, zScore } from '@/lib/iqc/westgard'

// CD4 %CD4 regression dataset (lot 25290, 19 runs) — see plan appendix.
const PCT_CD4 = [
  11.4, 11.64, 12.2, 12.19, 11.12, 11.41, 11.84, 11.29, 12.01, 11.28, 11.24, 11.5, 11.9, 10.76, 11.4,
  11.2, 12.08, 11.29, 11.64,
]
const ABS_CD4 = [169, 181, 182, 149, 175, 171, 187, 164, 155, 170, 149, 171, 171, 172, 154, 166, 172, 159, 168]

describe('descriptive stats', () => {
  it('matches the analysed %CD4 mean / SD / CV', () => {
    expect(mean(PCT_CD4)).toBeCloseTo(11.55, 2)
    expect(sd(PCT_CD4)).toBeCloseTo(0.4, 1)
    expect(cv(PCT_CD4)).toBeCloseTo(3.4, 1)
  })

  it('matches the analysed AbsCD4 mean / SD / CV', () => {
    expect(mean(ABS_CD4)).toBeCloseTo(167.6, 1)
    expect(sd(ABS_CD4)).toBeCloseTo(10.6, 1)
    // sample SD (n-1) gives CV 6.33%; the 6.2% in notes used population SD (n)
    expect(cv(ABS_CD4)).toBeCloseTo(6.3, 1)
  })

  it('returns 0 SD/CV for degenerate input', () => {
    expect(sd([5])).toBe(0)
    expect(cv([])).toBe(0)
    expect(zScore(5, 5, 0)).toBe(0)
  })
})

describe('toStat', () => {
  it('passes linear values through', () => {
    expect(toStat(167, 'linear')).toBe(167)
  })
  it('log10-transforms viral load titers', () => {
    expect(toStat(1000, 'log10')).toBeCloseTo(3, 6)
    expect(toStat(31623, 'log10')).toBeCloseTo(4.5, 3)
  })
})

describe('evaluateWestgard — CD4 baseline is fully in-control', () => {
  it('flags no rules for %CD4', () => {
    const points = evaluateWestgard(PCT_CD4, mean(PCT_CD4), sd(PCT_CD4))
    expect(points.every((p) => p.status === 'accepted')).toBe(true)
    expect(points.flatMap((p) => p.violatedRules)).toHaveLength(0)
  })
  it('flags no rules for AbsCD4', () => {
    const points = evaluateWestgard(ABS_CD4, mean(ABS_CD4), sd(ABS_CD4))
    expect(points.every((p) => p.status === 'accepted')).toBe(true)
  })
})

describe('evaluateWestgard — rule detection (mean 0, sd 1)', () => {
  const evalZ = (zSeries: number[]) => evaluateWestgard(zSeries, 0, 1)

  it('1-3s rejects a single point beyond 3 SD', () => {
    const p = evalZ([0, 0, 3.5])
    expect(p[2].status).toBe('rejected')
    expect(p[2].violatedRules).toContain('1-3s')
  })

  it('1-2s warns (not rejects) on a single point beyond 2 SD', () => {
    const p = evalZ([0, 2.4])
    expect(p[1].status).toBe('warning')
    expect(p[1].violatedRules).toEqual(['1-2s'])
  })

  it('2-2s rejects two consecutive points beyond 2 SD same side', () => {
    const p = evalZ([0, 2.3, 2.5])
    expect(p[2].violatedRules).toContain('2-2s')
    expect(p[2].status).toBe('rejected')
  })

  it('R-4s rejects a swing greater than 4 SD across consecutive points', () => {
    const p = evalZ([0, 2.3, -2.3])
    expect(p[2].violatedRules).toContain('R-4s')
    expect(p[2].status).toBe('rejected')
  })

  it('4-1s rejects four consecutive points beyond 1 SD same side', () => {
    const p = evalZ([1.2, 1.3, 1.4, 1.5])
    expect(p[3].violatedRules).toContain('4-1s')
  })

  it('10x rejects ten consecutive points on one side of the mean', () => {
    const p = evalZ([0.2, 0.1, 0.3, 0.2, 0.4, 0.1, 0.2, 0.3, 0.1, 0.2])
    expect(p[9].violatedRules).toContain('10x')
    expect(p[9].status).toBe('rejected')
  })
})
