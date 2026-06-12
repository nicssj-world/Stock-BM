import { TransactionView } from '@/components/transaction-view'
import { requirePageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function MovePage({ searchParams }: { searchParams: Promise<{ lotId?: string; locationId?: string }> }) {
  const actor = await requirePageActor()
  const params = await searchParams
  return <TransactionView mode="move" initialData={await getStockWorkspace(actor)} defaultLotId={params.lotId} defaultLocationId={params.locationId} />
}

