import { describe, expect, it } from 'vitest'
import { addTwoMonths, formatHpvBoxPosition, getHpvDestructionState, isHpvBoxFull, isHpvSpecimenType, nextHpvBoxPosition, resolveHpvStorageBoxes, specimenTypeLabel, summarizeHpvSites } from '@/lib/hpv/rules'

describe('HPV storage rules', () => {
  it('keeps a closed/full box viewable while intake moves to another open box', () => {
    const full = { id: 'full-box', status: 'full' as const }
    const open = { id: 'open-box', status: 'open' as const }
    expect(resolveHpvStorageBoxes([full, open], full.id, full.id)).toEqual({ openBoxes: [open], viewBox: full, intakeBox: open })
    expect(resolveHpvStorageBoxes([full], full.id, full.id)).toEqual({ openBoxes: [], viewBox: full, intakeBox: null })
  })
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

  it('sets destruction due date two calendar months after the box is filled', () => {
    const filled = new Date('2026-06-22T03:30:00.000Z')
    expect(addTwoMonths(filled).toISOString()).toBe('2026-08-22T03:30:00.000Z')
    expect(addTwoMonths(new Date('2026-12-31T03:30:00.000Z')).toISOString()).toBe('2027-02-28T03:30:00.000Z')
  })

  it('accepts the two allowed specimen types only', () => {
    expect(isHpvSpecimenType('self_collected')).toBe(true)
    expect(isHpvSpecimenType('clinician_collected')).toBe(true)
    expect(isHpvSpecimenType('mixed')).toBe(false)
  })

  it('provides staff-facing labels for specimen types', () => {
    expect(specimenTypeLabel('self_collected')).toBe('Self-collected')
    expect(specimenTypeLabel('clinician_collected')).toBe('Clinician-collected')
  })

  it('uses green before one month, orange after one month, and red after two months', () => {
    const filledAt = '2026-06-22T03:30:00.000Z'
    const destroyDueAt = '2026-08-22T03:30:00.000Z'
    expect(getHpvDestructionState(destroyDueAt, 'full', '2026-07-21', filledAt)).toBe('none')
    expect(getHpvDestructionState(destroyDueAt, 'full', '2026-07-22', filledAt)).toBe('due_soon')
    expect(getHpvDestructionState(destroyDueAt, 'full', '2026-08-21', filledAt)).toBe('due_soon')
    expect(getHpvDestructionState(destroyDueAt, 'full', '2026-08-22', filledAt)).toBe('due_now')
    expect(getHpvDestructionState(destroyDueAt, 'full', '2026-08-23', filledAt)).toBe('due_now')

    const monthEndFilledAt = '2026-12-31T03:30:00.000Z'
    const monthEndDueAt = '2027-02-28T03:30:00.000Z'
    expect(getHpvDestructionState(monthEndDueAt, 'full', '2027-01-30', monthEndFilledAt)).toBe('none')
    expect(getHpvDestructionState(monthEndDueAt, 'full', '2027-01-31', monthEndFilledAt)).toBe('due_soon')
  })

  it('does not warn for destroyed or undated boxes', () => {
    expect(getHpvDestructionState('2026-07-18T00:00:00.000Z', 'destroyed', '2026-07-13')).toBe('none')
    expect(getHpvDestructionState(null, 'open', '2026-07-13')).toBe('none')
  })
})

describe('HPV site summary rules', () => {
  it('computes issued, received, and outstanding quantities by site', () => {
    const summaries = summarizeHpvSites(
      [{ siteId: 'a', quantity: 10 }, { siteId: 'a', quantity: 5 }, { siteId: 'b', quantity: 3 }],
      [{ siteId: 'a', sampleCount: 4 }, { siteId: 'b', sampleCount: 5 }],
    )
    expect(summaries.a).toEqual({ siteId: 'a', issued: 15, received: 4, receivedSelfSupplied: 0, returned: 0, outstanding: 11 })
    expect(summaries.b).toEqual({ siteId: 'b', issued: 3, received: 5, receivedSelfSupplied: 0, returned: 0, outstanding: -2 })
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

  it('does not reduce outstanding for self-supplied receipts', () => {
    const summaries = summarizeHpvSites(
      [{ siteId: 'a', quantity: 15 }],
      [{ siteId: 'a', sampleCount: 4 }, { siteId: 'a', sampleCount: 6, selfSupplied: true }],
    )
    expect(summaries.a.received).toBe(10)
    expect(summaries.a.receivedSelfSupplied).toBe(6)
    expect(summaries.a.outstanding).toBe(11)
  })
})
