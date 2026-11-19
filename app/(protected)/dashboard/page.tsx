import { DashboardView } from '@/components/dashboard-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEnvDashboardData } from '@/lib/server/environment'
import { getHpvDashboardData } from '@/lib/server/hpv'
import { getHivDrtDashboardData } from '@/lib/server/hiv-drt'
import { getEquipmentDashboardData } from '@/lib/server/equipment'
import { getStockWorkspace } from '@/lib/server/stock'
import { getCalendarTodaySummary } from '@/lib/server/calendar'

export default async function DashboardPage() {
  const actor = await requireFullPageActor()
  const [stock, env, hpv, hivDrt, equipment, calendarToday] = await Promise.all([
    getStockWorkspace(actor, { includeTransactions: false }),
    getEnvDashboardData(actor),
    getHpvDashboardData(),
    getHivDrtDashboardData(),
    actor.role === 'Assistant' ? Promise.resolve({ active: 0, maintenance: 0, outOfService: 0, dueSoon: 0, overdue: 0, pending: 0 }) : getEquipmentDashboardData(),
    // The calendar card is optional: a calendar failure must never take the dashboard down.
    getCalendarTodaySummary().catch(() => null),
  ])
  return <DashboardView actor={actor} stock={stock} env={env} hpv={hpv} hivDrt={hivDrt} equipment={equipment} calendarToday={calendarToday} />
}
