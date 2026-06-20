import { BatchIssue } from '@/components/batch-issue'
import { requirePageActor } from '@/lib/server/auth'

export default async function IssueBatchPage() {
  await requirePageActor()
  return <BatchIssue />
}
