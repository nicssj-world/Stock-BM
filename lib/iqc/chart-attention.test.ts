import { describe, expect, it } from 'vitest'
import { chartNeedsAttention, isAwaitingBaselineData } from '@/lib/iqc/chart-attention'

const points = (n: number) => Array.from({ length: n }, () => ({ isVoided: false }))
const vl = { status: 'not_evaluated' as const, policyProfile: 'vl-standard-v1' as const, baselineState: null }

describe('chart attention', () => {
  it('treats a VL chart under 20 points without a baseline as awaiting data, not attention', () => {
    const chart = { ...vl, points: points(7) }
    expect(isAwaitingBaselineData(chart)).toBe(true)
    expect(chartNeedsAttention(chart, false)).toBe(false)
  })

  it('flags a VL chart that reached 20 points but still has no baseline', () => {
    const chart = { ...vl, points: points(20) }
    expect(isAwaitingBaselineData(chart)).toBe(false)
    expect(chartNeedsAttention(chart, false)).toBe(true)
  })

  it('does not count voided points toward the 20', () => {
    const chart = { ...vl, points: [...points(19), { isVoided: true }] }
    expect(isAwaitingBaselineData(chart)).toBe(true)
  })

  it('keeps warnings, rejections and expiring lots as attention', () => {
    expect(chartNeedsAttention({ ...vl, status: 'warning', points: points(3) }, false)).toBe(true)
    expect(chartNeedsAttention({ ...vl, status: 'rejected', points: points(3) }, false)).toBe(true)
    expect(chartNeedsAttention({ ...vl, points: points(3) }, true)).toBe(true)
  })

  it('leaves non-VL not-evaluated charts in attention', () => {
    expect(chartNeedsAttention({ status: 'not_evaluated', policyProfile: 'cd4-legacy', baselineState: null, points: points(3) }, false)).toBe(true)
  })
})
