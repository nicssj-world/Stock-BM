import { describe, expect, it } from 'vitest'
import { buildBalancesCsv } from '@/lib/bm/csv'
import type { StockWorkspace } from '@/lib/bm/types'

describe('BM stock CSV', () => {
  it('adds UTF-8 BOM and escapes Excel-sensitive values', () => {
    const workspace = {
      categories: [],
      locations: [],
      transactions: [],
      activeItemCount: 1,
      lowStockItemCount: 0,
      expiringLotCount: 0,
      expiredLotCount: 0,
      locationCount: 1,
      items: [{
        id: 'item',
        itemCode: 'KIT,1',
        name: 'น้ำยา "A"',
        categoryId: 'cat',
        categoryName: 'Reagent',
        unit: 'kit',
        minimumStock: 1,
        expiryWarningDays: 90,
        defaultIssueQty: null,
        storageCondition: null,
        supplier: null,
        catalogNo: null,
        manufacturer: null,
        manufacturerBarcode: null,
        trackLot: true,
        trackExpiry: true,
        isHpv: false,
        isActive: true,
        totalOnHand: 2,
        usableOnHand: 2,
        isLowStock: false,
        lots: [{
          id: 'lot',
          itemId: 'item',
          lotNumber: 'L1',
          expiryDate: null,
          expiryState: 'none',
          internalQrToken: 'token',
          manufacturerBarcode: null,
          createdAt: '',
          totalOnHand: 2,
          usableOnHand: 2,
          balances: [{ lotId: 'lot', locationId: 'loc', locationCode: '4C', locationName: 'Fridge', onHand: 2 }],
        }],
      }],
    } satisfies StockWorkspace
    const output = buildBalancesCsv(workspace)
    expect(output.charCodeAt(0)).toBe(0xfeff)
    expect(output).toContain('"KIT,1"')
    expect(output).toContain('"น้ำยา ""A"""')
  })
})

