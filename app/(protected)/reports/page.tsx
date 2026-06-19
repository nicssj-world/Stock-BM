import { ReportsAuditView } from '@/components/reports-audit-view'
import { requirePageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function ReportsPage() {
  const actor = await requirePageActor()
  return <ReportsAuditView stock={await getStockWorkspace(actor)} />
}
