import { ScanView } from '@/components/scan-view'

export default async function ScanLotPage({ params }: { params: Promise<{ token: string }> }) {
  return <ScanView initialCode={(await params).token} />
}

