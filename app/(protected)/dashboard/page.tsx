import { DashboardView } from '@/components/dashboard-view'
import { requirePageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function DashboardPage() {
  const actor = await requirePageActor()
  return <DashboardView actor={actor} stock={await getStockWorkspace(actor)} />
}

