import { BatchIssue } from '@/components/batch-issue'
import { requireFullPageActor } from '@/lib/server/auth'

export default async function IssueBatchPage() {
  await requireFullPageActor()
  return <BatchIssue />
}
