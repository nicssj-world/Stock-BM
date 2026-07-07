'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Camera, CheckCircle2, Layers, MoveRight, PackagePlus, QrCode, ScanLine } from 'lucide-react'
import type { QuickIssueResult, ScanResolution } from '@/lib/bm/types'
import { formatQuantity } from '@/lib/bm/rules'
import { useCameraScanner } from '@/components/camera-scanner'
import { api, Button, Card, Input, Notice, PageHeader } from '@/components/ui'

export function ScanView({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode ?? '')
  const [result, setResult] = useState<ScanResolution | null>(null)
  const [issued, setIssued] = useState<QuickIssueResult | null>(null)
  const [error, setError] = useState('')

  async function resolve(nextCode = code) {
    const trimmed = nextCode.trim()
    if (!trimmed) return
    setError('')
    setIssued(null)
    try {
      const response = await api<{ result: ScanResolution }>('/api/scan/resolve', { method: 'POST', body: JSON.stringify({ code: trimmed }) })
      setResult(response.result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Scan failed')
    }
  }

  async function quickIssue(scanResult: ScanResolution) {
    const scanCode = scanResult.lotToken ?? scanResult.code
    if (!scanCode) return
    setError('')
    try {
      const quick = await api<{ result: QuickIssueResult }>('/api/stock/issues/quick', { method: 'POST', body: JSON.stringify({ code: scanCode }) })
      setIssued(quick.result)
      setCode('')
      setResult(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Quick issue failed')
    }
  }

  useEffect(() => {
    if (!initialCode) return
    const timer = window.setTimeout(() => {
      void resolve(initialCode)
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode])

  const { cameraOn, starting, toggle, videoRef } = useCameraScanner({
    stopOnScan: true,
    onError: setError,
    onScan: (text) => {
      setCode(text)
      void resolve(text)
    },
  })

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Scanner"
        title="สแกน / Scan"
        description="ค้นหา internal QR หรือ manufacturer barcode"
        actions={<Link href="/issue/batch"><Button variant="secondary"><Layers className="size-4" /> ตัดหลายรายการ</Button></Link>}
      />
      <Card className="p-4">
        <form onSubmit={(event) => { event.preventDefault(); resolve() }} className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <ScanLine className="absolute top-3 left-3 size-5 text-[#7b979c]" />
            <Input autoFocus value={code} onChange={(event) => setCode(event.target.value)} className="h-12 pl-11 mono text-base" placeholder="QR / barcode" />
          </div>
          <Button className="h-12"><QrCode className="size-4" /> Resolve</Button>
          <Button type="button" variant="secondary" className="h-12" onClick={toggle}><Camera className="size-4" /> {cameraOn ? 'Stop camera' : starting ? 'Opening...' : 'Camera'}</Button>
        </form>
        {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
        {cameraOn ? <div className="mt-4 overflow-hidden rounded-md border border-[#d6e2e3] bg-black"><video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" /></div> : null}
      </Card>
      {issued ? <QuickIssueDone result={issued} /> : null}
      {result ? <ScanResult result={result} onQuickIssue={quickIssue} /> : null}
    </div>
  )
}

function QuickIssueDone({ result }: { result: QuickIssueResult }) {
  return (
    <Notice tone="success">
      <CheckCircle2 className="size-4" />
      ตัด stock แล้ว: <span className="mono font-bold">{result.itemCode} LOT {result.lotNumber}</span> · {formatQuantity(result.quantity)} {result.unit} จาก {result.locationCode}
    </Notice>
  )
}

function ScanResult({ result, onQuickIssue }: { result: ScanResolution; onQuickIssue: (result: ScanResolution) => void }) {
  if (result.kind === 'unknown') return <Notice tone="warning">ไม่พบรหัส / Unknown code: <span className="mono">{result.code}</span></Notice>
  if (result.kind === 'location') {
    return (
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">location</p>
            <h2 className="mt-1 text-xl font-bold text-[#173d50]">{result.locationCode ?? '-'} · {result.locationName ?? '-'}</h2>
            <p className="mt-2 text-sm text-[#55727c]">เปิดคลังเฉพาะ location นี้</p>
          </div>
          <Button onClick={() => { window.location.href = result.href ?? `/inventory?locationId=${result.locationId}` }}><PackagePlus className="size-4" /> View stock</Button>
        </div>
      </Card>
    )
  }
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">{result.kind}</p>
          <h2 className="mt-1 text-xl font-bold text-[#173d50]">{result.itemCode ?? '-'} · {result.itemName ?? '-'}</h2>
          {result.lotNumber ? <p className="mono mt-2 text-sm text-[#55727c]">LOT {result.lotNumber}{result.locationCode ? ` · ${result.locationCode}` : ''}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {result.itemId ? <Button variant="secondary" onClick={() => { window.location.href = `/movements?mode=receive&itemId=${result.itemId}` }}><PackagePlus className="size-4" /> Receive</Button> : null}
          {result.kind === 'internal-lot' ? <Button onClick={() => onQuickIssue(result)}><CheckCircle2 className="size-4" /> Quick issue</Button> : null}
          {result.lotToken ? <Button onClick={() => { window.location.href = `/issue/${result.lotToken}` }}><QrCode className="size-4" /> Issue</Button> : result.lotId ? <Button onClick={() => { window.location.href = `/movements?mode=issue&lotId=${result.lotId}${result.locationId ? `&locationId=${result.locationId}` : ''}` }}><QrCode className="size-4" /> Issue</Button> : null}
          {result.lotId ? <Button variant="secondary" onClick={() => { window.location.href = `/movements?mode=move&lotId=${result.lotId}${result.locationId ? `&locationId=${result.locationId}` : ''}` }}><MoveRight className="size-4" /> Move</Button> : null}
        </div>
      </div>
    </Card>
  )
}
