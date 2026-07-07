import { ScanView } from '@/components/scan-view'
import { requireFullPageActor } from '@/lib/server/auth'

export default async function ScanPage() {
  await requireFullPageActor()
  return <ScanView />
}
