import { ReportsView } from '@/components/reports-view'
import { requirePageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function ReportsPage() {
  const actor = await requirePageActor()
  return <ReportsView stock={await getStockWorkspace(actor)} />
}

