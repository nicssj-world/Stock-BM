import { AuditView } from '@/components/audit-view'
import { requirePageActor } from '@/lib/server/auth'

export default async function AuditPage() {
  await requirePageActor()
  return <AuditView />
}

