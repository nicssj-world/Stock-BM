'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Camera, CheckCircle2, Layers, MoveRight, PackagePlus, QrCode, ScanLine } from 'lucide-react'
import type { QuickIssueResult, ScanResolution } from '@/lib/bm/types'
import { formatQuantity } from '@/lib/bm/rules'
import { useCameraScanner } from '@/components/camera-scanner'
import { api, Button, Card, Input, Notice, PageHeader } from '@/components/ui'
import { StockModuleShell, StockPanelTitle } from '@/components/stock-module-shell'

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
    <StockModuleShell>
      <PageHeader
        eyebrow="Scanner / point of action"
        title="สแกน / Scan"
        description="สแกน QR หรือ barcode แล้วไปยัง action ที่ถูกต้องได้ทันที"
        actions={<Link href="/issue/batch"><Button variant="secondary"><Layers className="size-4" /> ตัดหลายรายการ</Button></Link>}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <Card className="overflow-hidden rounded-xl">
          <StockPanelTitle eyebrow="Scanner console" title="ระบุ lot หรือ location" />
          <div className="p-4 sm:p-5">
            <form onSubmit={(event) => { event.preventDefault(); resolve() }} className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <ScanLine className="absolute top-4 left-4 size-5 text-[#0b7f76]" />
                <Input autoFocus value={code} onChange={(event) => setCode(event.target.value)} className="h-14 border-[#bcd8d5] bg-[#fbfefd] pl-12 mono text-base font-semibold shadow-inner" placeholder="QR / barcode" />
              </div>
              <Button className="h-14"><QrCode className="size-4" /> Resolve</Button>
              <Button type="button" variant="secondary" className="h-14" onClick={toggle}><Camera className="size-4" /> {cameraOn ? 'Stop camera' : starting ? 'Opening...' : 'Camera'}</Button>
            </form>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-dashed border-[#d8e7e5] pt-3 text-xs text-[#71898d]"><span><b className="text-[#315763]">1.</b> ยิง QR sticker ของ lot</span><span><b className="text-[#315763]">2.</b> ตรวจผลที่พบ</span><span><b className="text-[#315763]">3.</b> เลือก action</span></div>
            {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
            {cameraOn ? <div className="relative mt-4 overflow-hidden rounded-xl border border-[#bdd7d4] bg-[#071d23] p-2 shadow-inner"><div className="pointer-events-none absolute inset-[18%] z-10 rounded-lg border-2 border-[#7ee3d8] shadow-[0_0_0_999px_rgba(0,0,0,0.2)]" /><video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full rounded-lg object-cover" /></div> : null}
          </div>
        </Card>
        <aside className="space-y-4 xl:sticky xl:top-6">
          <Card className="rounded-xl border-[#cce5df] bg-[linear-gradient(145deg,#fafffe,#edf9f6)] p-5">
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">Scanner ready</p>
            <p className="mt-2 text-sm leading-6 text-[#648087]">สแกน lot เพื่อเปิดข้อมูลหรือทำ Quick issue และสแกน location เพื่อเปิดยอดคงเหลือเฉพาะจุดจัดเก็บ</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-lg border border-[#d6e9e4] bg-white/80 p-2"><QrCode className="mx-auto size-4 text-[#0b7f76]" /><p className="mt-1 text-[10px] font-bold text-[#527178]">LOT QR</p></div><div className="rounded-lg border border-[#d6e9e4] bg-white/80 p-2"><PackagePlus className="mx-auto size-4 text-[#0b7f76]" /><p className="mt-1 text-[10px] font-bold text-[#527178]">BARCODE</p></div></div>
          </Card>
          {issued ? <QuickIssueDone result={issued} /> : null}
          {result ? <ScanResult result={result} onQuickIssue={quickIssue} /> : null}
        </aside>
      </div>
    </StockModuleShell>
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
      <Card className="overflow-hidden rounded-xl border-[#cbdfe0] p-4">
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
    <Card className="overflow-hidden rounded-xl border-[#cbdfe0] p-4">
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
