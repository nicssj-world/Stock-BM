import { DashboardView } from '@/components/dashboard-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEnvDashboardData } from '@/lib/server/environment'
import { getHpvDashboardData } from '@/lib/server/hpv'
import { getHivDrtDashboardData } from '@/lib/server/hiv-drt'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function DashboardPage() {
  const actor = await requireFullPageActor()
  const [stock, env, hpv, hivDrt] = await Promise.all([
    getStockWorkspace(actor, { includeTransactions: false }),
    getEnvDashboardData(actor),
    getHpvDashboardData(),
    getHivDrtDashboardData(),
  ])
  return <DashboardView actor={actor} stock={stock} env={env} hpv={hpv} hivDrt={hivDrt} />
}
