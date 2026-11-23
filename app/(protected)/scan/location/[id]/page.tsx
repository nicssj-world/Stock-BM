import { ScanView } from '@/components/scan-view'
import { requirePageActor } from '@/lib/server/auth'

export default async function ScanLocationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageActor()
  return <ScanView initialCode={`BMLOC:${(await params).id}`} />
}
