import { ScanView } from '@/components/scan-view'
import { requirePageActor } from '@/lib/server/auth'

export default async function ScanLotPage({ params }: { params: Promise<{ token: string }> }) {
  await requirePageActor()
  return <ScanView initialCode={(await params).token} />
}

