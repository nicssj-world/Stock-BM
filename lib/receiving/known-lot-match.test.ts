import { describe, expect, it } from 'vitest'
import { matchKnownLots, normalizeLot, type KnownLotMatchItem } from './known-lot-match'

const lots: KnownLotMatchItem[] = [
  { lotId: 'lot-1', itemId: 'item-1', lotNumber: 'LOT-2026-01', expiryDate: '2027-01-31', itemCode: 'ITEM-1' },
  { lotId: 'lot-2', itemId: 'item-2', lotNumber: 'LOT-2026-02', expiryDate: '2027-02-28', itemCode: 'ITEM-2' },
]

describe('known-lot OCR matching', () => {
  it('normalizes separators without inventing a lot value', () => {
    expect(normalizeLot(' lot / 2026-01 ')).toBe('LOT202601')
  })

  it('returns a unique exact lot', () => {
    const result = matchKnownLots('Invoice lot: LOT/2026-01', lots)
    expect(result.kind).toBe('exact_unique')
    if (result.kind === 'exact_unique') expect(result.lotId).toBe('lot-1')
  })

  it('requires an explicit choice when normalized lots collide', () => {
    const result = matchKnownLots('LOT202601', [
      ...lots,
      { lotId: 'lot-duplicate', itemId: 'item-3', lotNumber: 'LOT 2026 01', expiryDate: null, itemCode: 'ITEM-3' },
    ])
    expect(result.kind).toBe('exact_ambiguous')
    if (result.kind === 'exact_ambiguous') expect(result.lotIds).toEqual(['lot-1', 'lot-duplicate'])
  })

  it('returns a suggestion rather than selecting a near lot', () => {
    const result = matchKnownLots('LOT202612', lots)
    expect(result.kind).toBe('similar')
    if (result.kind === 'similar') expect(result.candidates[0].lotId).toBe('lot-2')
  })

  it('does not match a lot as a substring of a longer token', () => {
    expect(matchKnownLots('LOT2026019', lots).kind).toBe('none')
  })
})
