import { TransactionView } from '@/components/transaction-view'
import { requirePageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ itemId?: string }> }) {
  const actor = await requirePageActor()
  const params = await searchParams
  return <TransactionView mode="receive" initialData={await getStockWorkspace(actor)} defaultItemId={params.itemId} />
}

