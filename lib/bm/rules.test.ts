import { describe, expect, it } from 'vitest'
import { formatDate, getExpiryState, sortLotsFefo } from '@/lib/bm/rules'
import type { StockLot } from '@/lib/bm/types'

function lot(id: string, expiryDate: string | null, createdAt = '2026-01-01T00:00:00Z'): StockLot {
  return {
    id,
    itemId: 'item',
    lotNumber: id,
    expiryDate,
    expiryState: getExpiryState(expiryDate, 90, '2026-06-12'),
    internalQrToken: id,
    manufacturerBarcode: null,
    createdAt,
    totalOnHand: 1,
    usableOnHand: 1,
    balances: [],
  }
}

describe('BM stock rules', () => {
  it('classifies expiry state with item warning days', () => {
    expect(getExpiryState(null, 90, '2026-06-12')).toBe('none')
    expect(getExpiryState('2026-06-11', 90, '2026-06-12')).toBe('expired')
    expect(getExpiryState('2026-07-01', 90, '2026-06-12')).toBe('expiring')
    expect(getExpiryState('2027-01-01', 90, '2026-06-12')).toBe('ok')
  })

  it('sorts lots by FEFO with no-expiry last', () => {
    expect(sortLotsFefo([lot('C', null), lot('A', '2026-08-01'), lot('B', '2026-07-01')]).map((item) => item.id)).toEqual(['B', 'A', 'C'])
  })

  it('formats date-only values and timestamps without crashing', () => {
    expect(formatDate('2026-08-23T03:00:00.000Z')).toBe(formatDate('2026-08-23'))
    expect(formatDate('not-a-date')).toBe('-')
  })
})
