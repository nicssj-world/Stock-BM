import { ReportsAuditView } from '@/components/reports-audit-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function ReportsPage() {
  const actor = await requireFullPageActor()
  return <ReportsAuditView stock={await getStockWorkspace(actor)} />
}
