import type { StockItem, StockWorkspace } from '@/lib/bm/types'

export function stockItemMatchesEquipment(item: StockItem, equipmentId: string) {
  return equipmentId === 'all' || Boolean(item.equipmentIds?.includes(equipmentId))
}

export function filterStockWorkspaceByEquipment(workspace: StockWorkspace, equipmentId: string) {
  if (equipmentId === 'all') return workspace

  const items = workspace.items.filter((item) => stockItemMatchesEquipment(item, equipmentId))
  const itemIds = new Set(items.map((item) => item.id))
  const transactions = workspace.transactions
    .map((transaction) => ({ ...transaction, lines: transaction.lines.filter((line) => itemIds.has(line.itemId)) }))
    .filter((transaction) => transaction.lines.length > 0)
  const activeItems = items.filter((item) => item.isActive)
  const stockedLots = items.flatMap((item) => item.lots).filter((lot) => lot.totalOnHand > 0)
  const activeLocationIds = new Set(stockedLots.flatMap((lot) => lot.balances.filter((balance) => balance.onHand > 0).map((balance) => balance.locationId)))

  return {
    ...workspace,
    items,
    transactions,
    activeItemCount: activeItems.length,
    lowStockItemCount: activeItems.filter((item) => item.isLowStock).length,
    expiringLotCount: stockedLots.filter((lot) => lot.expiryState === 'expiring').length,
    expiredLotCount: stockedLots.filter((lot) => lot.expiryState === 'expired').length,
    locationCount: workspace.locations.filter((location) => location.isActive && activeLocationIds.has(location.id)).length,
  }
}
