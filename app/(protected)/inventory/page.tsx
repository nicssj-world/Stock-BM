import { InventoryView } from '@/components/inventory-view'
import { requirePageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function InventoryPage() {
  const actor = await requirePageActor()
  return <InventoryView actor={actor} initialData={await getStockWorkspace(actor)} />
}

