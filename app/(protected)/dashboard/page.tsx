import { DashboardView } from '@/components/dashboard-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEnvDashboardData } from '@/lib/server/environment'
import { getHpvDashboardData } from '@/lib/server/hpv'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function DashboardPage() {
  const actor = await requireFullPageActor()
  const [stock, env, hpv] = await Promise.all([
    getStockWorkspace(actor, { includeTransactions: false }),
    getEnvDashboardData(actor),
    getHpvDashboardData(),
  ])
  return <DashboardView actor={actor} stock={stock} env={env} hpv={hpv} />
}
