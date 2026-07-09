import { describe, expect, it } from 'vitest'
import { addOneMonth, formatHpvBoxPosition, isHpvBoxFull, nextHpvBoxPosition, summarizeHpvSites } from '@/lib/hpv/rules'

describe('HPV storage rules', () => {
  it('finds the first open position in a 5x5 box', () => {
    expect(nextHpvBoxPosition([1, 2, 4])).toBe(3)
    expect(formatHpvBoxPosition(1)).toBe('A1')
    expect(formatHpvBoxPosition(25)).toBe('E5')
  })

  it('detects a full HPV storage box', () => {
    expect(isHpvBoxFull(Array.from({ length: 24 }, (_, index) => index + 1))).toBe(false)
    expect(isHpvBoxFull(Array.from({ length: 25 }, (_, index) => index + 1))).toBe(true)
    expect(nextHpvBoxPosition(Array.from({ length: 25 }, (_, index) => index + 1))).toBeNull()
  })

  it('sets destruction due date one month after the box is filled', () => {
    const filled = new Date('2026-06-22T03:30:00.000Z')
    expect(addOneMonth(filled).toISOString()).toBe('2026-07-22T03:30:00.000Z')
  })
})

describe('HPV site summary rules', () => {
  it('computes issued, received, and outstanding quantities by site', () => {
    const summaries = summarizeHpvSites(
      [{ siteId: 'a', quantity: 10 }, { siteId: 'a', quantity: 5 }, { siteId: 'b', quantity: 3 }],
      [{ siteId: 'a', sampleCount: 4 }, { siteId: 'b', sampleCount: 5 }],
    )
    expect(summaries.a).toEqual({ siteId: 'a', issued: 15, received: 4, returned: 0, outstanding: 11, selfSupplied: false })
    expect(summaries.b).toEqual({ siteId: 'b', issued: 3, received: 5, returned: 0, outstanding: -2, selfSupplied: false })
  })

  it('subtracts returned kits from outstanding quantities', () => {
    const summaries = summarizeHpvSites(
      [{ siteId: 'a', quantity: 15 }],
      [{ siteId: 'a', sampleCount: 4 }],
      [{ siteId: 'a', quantity: 3 }],
    )
    expect(summaries.a.outstanding).toBe(8)
    expect(summaries.a.returned).toBe(3)
  })
})
