import { describe, expect, it } from 'vitest'
import { filterStockWorkspaceByEquipment, stockItemMatchesEquipment } from '@/lib/bm/stock-equipment-filter'
import type { StockWorkspace } from '@/lib/bm/types'

const workspace = {
  categories: [],
  locations: [{ id: 'loc-1', code: '4C', name: 'Fridge', storageCondition: null, isActive: true }],
  equipmentOptions: [{ id: 'equip-1', code: 'EQ-1', name: 'Analyzer', status: 'active' }],
  activeItemCount: 2,
  lowStockItemCount: 1,
  expiringLotCount: 1,
  expiredLotCount: 0,
  locationCount: 1,
  items: [
    {
      id: 'item-1', itemCode: 'REAG-1', name: 'Linked reagent', categoryId: 'cat', categoryName: 'Reagent', unit: 'kit', minimumStock: 2, expiryWarningDays: 90, defaultIssueQty: null, storageCondition: null, supplier: null, catalogNo: null, manufacturer: null, manufacturerBarcode: null, trackLot: true, trackExpiry: true, isHpv: false, hpvSelfCollected: false, hpvClinicianCollected: false, equipmentIds: ['equip-1'], isActive: true, totalOnHand: 1, usableOnHand: 1, isLowStock: true,
      lots: [{ id: 'lot-1', itemId: 'item-1', lotNumber: 'L1', expiryDate: '2026-08-01', expiryState: 'expiring', internalQrToken: 'token-1', manufacturerBarcode: null, createdAt: '', totalOnHand: 1, usableOnHand: 1, balances: [{ lotId: 'lot-1', locationId: 'loc-1', locationCode: '4C', locationName: 'Fridge', onHand: 1 }] }],
    },
    {
      id: 'item-2', itemCode: 'REAG-2', name: 'Other reagent', categoryId: 'cat', categoryName: 'Reagent', unit: 'kit', minimumStock: 0, expiryWarningDays: 90, defaultIssueQty: null, storageCondition: null, supplier: null, catalogNo: null, manufacturer: null, manufacturerBarcode: null, trackLot: true, trackExpiry: true, isHpv: false, hpvSelfCollected: false, hpvClinicianCollected: false, equipmentIds: [], isActive: true, totalOnHand: 3, usableOnHand: 3, isLowStock: false,
      lots: [],
    },
  ],
  transactions: [{ id: 'tx-1', transactionType: 'receive', reference: null, purpose: null, note: null, overrideReason: null, sourceTransactionId: null, reversedByTransactionId: null, createdBy: 'user-1', createdByName: 'Admin', createdAt: '', canReverse: false, lines: [
    { lotId: 'lot-1', lotNumber: 'L1', itemId: 'item-1', itemCode: 'REAG-1', itemName: 'Linked reagent', unit: 'kit', locationId: 'loc-1', locationCode: '4C', locationName: 'Fridge', quantity: 1 },
    { lotId: 'lot-2', lotNumber: 'L2', itemId: 'item-2', itemCode: 'REAG-2', itemName: 'Other reagent', unit: 'kit', locationId: 'loc-1', locationCode: '4C', locationName: 'Fridge', quantity: 1 },
  ]}],
} satisfies StockWorkspace

describe('stock equipment filtering', () => {
  it('matches only items linked to the selected equipment', () => {
    expect(stockItemMatchesEquipment(workspace.items[0], 'equip-1')).toBe(true)
    expect(stockItemMatchesEquipment(workspace.items[1], 'equip-1')).toBe(false)
  })

  it('filters summary metrics and transaction lines together', () => {
    const filtered = filterStockWorkspaceByEquipment(workspace, 'equip-1')
    expect(filtered.items.map((item) => item.id)).toEqual(['item-1'])
    expect(filtered.lowStockItemCount).toBe(1)
    expect(filtered.expiringLotCount).toBe(1)
    expect(filtered.transactions[0]?.lines.map((line) => line.itemId)).toEqual(['item-1'])
  })
})
