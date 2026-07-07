import { TransactionView } from '@/components/transaction-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

type Mode = 'receive' | 'issue' | 'move' | 'adjust'
const MODES: Mode[] = ['receive', 'issue', 'move', 'adjust']

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; itemId?: string; lotId?: string; locationId?: string }>
}) {
  const actor = await requireFullPageActor()
  const params = await searchParams
  const initialMode: Mode = MODES.includes(params.mode as Mode) ? (params.mode as Mode) : 'receive'
  return (
    <TransactionView
      actor={actor}
      initialMode={initialMode}
      initialData={await getStockWorkspace(actor)}
      defaultItemId={params.itemId}
      defaultLotId={params.lotId}
      defaultLocationId={params.locationId}
    />
  )
}
