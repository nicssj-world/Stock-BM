import { InventoryView } from '@/components/inventory-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>
}) {
  const actor = await requireFullPageActor()
  const params = await searchParams
  return <InventoryView actor={actor} initialData={await getStockWorkspace(actor)} defaultLocationId={params.locationId} />
}
