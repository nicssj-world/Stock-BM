import { ScanView } from '@/components/scan-view'

export default async function ScanLocationPage({ params }: { params: Promise<{ id: string }> }) {
  return <ScanView initialCode={`BMLOC:${(await params).id}`} />
}
