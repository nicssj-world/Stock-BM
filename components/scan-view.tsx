'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, MoveRight, PackagePlus, QrCode, ScanLine } from 'lucide-react'
import type { ScanResolution } from '@/lib/bm/types'
import { api, Button, Card, Input, Notice, PageHeader } from '@/components/ui'

export function ScanView({ initialCode }: { initialCode?: string }) {
  const router = useRouter()
  const [code, setCode] = useState(initialCode ?? '')
  const [result, setResult] = useState<ScanResolution | null>(null)
  const [error, setError] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  async function resolve(nextCode = code) {
    const trimmed = nextCode.trim()
    if (!trimmed) return
    setError('')
    try {
      const response = await api<{ result: ScanResolution }>('/api/scan/resolve', { method: 'POST', body: JSON.stringify({ code: trimmed }) })
      setResult(response.result)
      if (response.result.href && response.result.kind === 'internal-lot') router.replace(response.result.href)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Scan failed')
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

  useEffect(() => {
    if (!cameraOn || !videoRef.current) return
    let stopped = false
    let controls: { stop: () => void } | undefined
    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (decodeResult) => {
          const text = decodeResult?.getText()
          if (text && !stopped) {
            stopped = true
            setCameraOn(false)
            setCode(text)
            resolve(text)
          }
        })
      } catch (cameraError) {
        setError(cameraError instanceof Error ? cameraError.message : 'Camera unavailable')
        setCameraOn(false)
      }
    }
    start()
    return () => {
      stopped = true
      controls?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader eyebrow="Scanner" title="สแกน / Scan" description="ค้นหา internal QR หรือ manufacturer barcode" />
      <Card className="p-4">
        <form onSubmit={(event) => { event.preventDefault(); resolve() }} className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <ScanLine className="absolute top-3 left-3 size-5 text-[#7b979c]" />
            <Input autoFocus value={code} onChange={(event) => setCode(event.target.value)} className="h-12 pl-11 mono text-base" placeholder="QR / barcode" />
          </div>
          <Button className="h-12"><QrCode className="size-4" /> Resolve</Button>
          <Button type="button" variant="secondary" className="h-12" onClick={() => setCameraOn((value) => !value)}><Camera className="size-4" /> Camera</Button>
        </form>
        {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
        {cameraOn ? <div className="mt-4 overflow-hidden rounded-md border border-[#d6e2e3] bg-black"><video ref={videoRef} className="aspect-video w-full object-cover" /></div> : null}
      </Card>
      {result ? <ScanResult result={result} /> : null}
    </div>
  )
}

function ScanResult({ result }: { result: ScanResolution }) {
  if (result.kind === 'unknown') return <Notice tone="warning">ไม่พบรหัส / Unknown code: <span className="mono">{result.code}</span></Notice>
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">{result.kind}</p>
          <h2 className="mt-1 text-xl font-bold text-[#173d50]">{result.itemCode ?? '-'} · {result.itemName ?? '-'}</h2>
          {result.lotNumber ? <p className="mono mt-2 text-sm text-[#55727c]">LOT {result.lotNumber}{result.locationCode ? ` · ${result.locationCode}` : ''}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {result.itemId ? <Button variant="secondary" onClick={() => { window.location.href = `/receive?itemId=${result.itemId}` }}><PackagePlus className="size-4" /> Receive</Button> : null}
          {result.lotId ? <Button onClick={() => { window.location.href = `/issue?lotId=${result.lotId}${result.locationId ? `&locationId=${result.locationId}` : ''}` }}><QrCode className="size-4" /> Issue</Button> : null}
          {result.lotId ? <Button variant="secondary" onClick={() => { window.location.href = `/move?lotId=${result.lotId}${result.locationId ? `&locationId=${result.locationId}` : ''}` }}><MoveRight className="size-4" /> Move</Button> : null}
        </div>
      </div>
    </Card>
  )
}
