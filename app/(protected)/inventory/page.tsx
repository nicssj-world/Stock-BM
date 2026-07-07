import { InventoryView } from '@/components/inventory-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function InventoryPage() {
  const actor = await requireFullPageActor()
  return <InventoryView actor={actor} initialData={await getStockWorkspace(actor)} />
}
