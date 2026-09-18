'use client'

import { useState } from 'react'
import { Camera, CheckCircle2, ScanLine, X } from 'lucide-react'
import type { CameraScanResult } from '@/components/camera-scanner'
import { useCameraScanner } from '@/components/camera-scanner'
import type { ParsedBarcode } from '@/lib/receiving/barcode'
import type { PackageScanResolution } from '@/lib/receiving/package-scan'
import { api, Button, Field, Input, Notice, StatusBadge } from '@/components/ui'

export type PackageScanResponse = PackageScanResolution & {
  parsed: ParsedBarcode & { itemId: string | null }
}

export type PackageScanResolver = (input: { raw: string; symbologyId: string | null; stockItemId: string | null }) => Promise<PackageScanResponse>

export function PackageScan({
  selectedItemId,
  disabled = false,
  onUse,
  resolveScan,
}: {
  selectedItemId: string | null
  disabled?: boolean
  onUse: (result: PackageScanResponse) => void
  resolveScan?: PackageScanResolver
}) {
  const [raw, setRaw] = useState('')
  const [symbologyId, setSymbologyId] = useState<string | null>(null)
  const [result, setResult] = useState<PackageScanResponse | null>(null)
  const [candidateChoice, setCandidateChoice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function parse(payload = raw, identifier = symbologyId) {
    const nextRaw = payload.trim()
    if (!nextRaw) return
    setBusy(true)
    setError(null)
    try {
      const response = resolveScan
        ? await resolveScan({ raw: nextRaw, symbologyId: identifier, stockItemId: selectedItemId || null })
        : await api<PackageScanResponse>('/api/receiving/scan/parse', {
          method: 'POST',
          body: JSON.stringify({ raw: nextRaw, symbologyId: identifier, stockItemId: selectedItemId || null }),
        })
      setResult(response)
      setCandidateChoice(null)
    } catch (requestError) {
      setResult(null)
      setError(requestError instanceof Error ? requestError.message : 'อ่าน barcode ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const { cameraOn, toggle, videoRef } = useCameraScanner({
    onScan: (code: string, details?: CameraScanResult) => {
      const identifier = details?.symbologyId ?? null
      setRaw(code)
      setSymbologyId(identifier)
      void parse(code, identifier)
    },
    onError: setError,
    stopOnScan: true,
  })

  const resolvedResult = result && result.match.kind === 'exact_ambiguous' && candidateChoice ? {
    ...result,
    itemId: candidateChoice,
    match: { ...result.match, itemId: candidateChoice },
    conflicts: [],
  } : result
  const canUse = Boolean(resolvedResult && resolvedResult.conflicts.length === 0 && (resolvedResult.parsed.lot || resolvedResult.parsed.expiry || resolvedResult.parsed.gtin))
  const matchTone = result?.match.kind === 'exact_unique' ? 'accepted' : result?.match.kind === 'exact_ambiguous' ? 'investigate' : 'neutral'
  const matchLabel = result?.match.kind === 'exact_unique' ? 'พบ Item เดียว' : result?.match.kind === 'exact_ambiguous' ? 'พบหลาย Item — ต้องเลือกเอง' : 'ไม่พบ GTIN — ใช้ manual fallback'

  return <div className="space-y-3 rounded-md border border-[#cfe1e2] bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-[#315763]">Package barcode / GS1 / HIBC</p><p className="mt-1 text-[11px] text-[#81979c]">อ่านเพื่อเติมข้อมูลใน draft เท่านั้น — ยังไม่บันทึก stock</p></div>{result ? <StatusBadge tone={matchTone} label={matchLabel} /> : null}</div>
    <Field label="Raw payload" hint="รองรับการพิมพ์, HID keyboard-wedge และกล้อง"><div className="flex gap-2"><Input value={raw} onChange={(event) => { setRaw(event.target.value); setResult(null) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void parse() } }} disabled={disabled || busy} className="mono" placeholder="Scan หรือวาง GS1/HIBC payload" /><Button type="button" variant="secondary" disabled={disabled || busy || !raw.trim()} onClick={() => void parse()}>อ่านข้อมูล</Button></div></Field>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={disabled || busy} onClick={toggle}>{cameraOn ? <X className="size-4" /> : <Camera className="size-4" />} {cameraOn ? 'ปิดกล้อง' : 'สแกนด้วยกล้อง'}</Button>{symbologyId ? <span className="inline-flex min-h-11 items-center gap-1 rounded-md border border-[#dce8e9] px-3 text-xs text-[#58747d]"><ScanLine className="size-4" />{symbologyId}</span> : null}</div>
    {cameraOn ? <div className="relative overflow-hidden rounded-md border border-[#d6e2e3] bg-black"><video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-[34%] w-[78%] rounded-lg border-2 border-[#5de1d0] shadow-[0_0_0_999px_rgba(0,0,0,.22),0_0_18px_rgba(93,225,208,.8)]" /></div></div> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {result ? <div className="space-y-2 rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-[#315763]">ข้อมูลที่อ่านได้</p>{result.parsed.standard ? <span className="mono text-[11px] text-[#789097]">{result.parsed.standard}</span> : null}</div><div className="grid gap-2 text-xs text-[#58747d] sm:grid-cols-2"><p>GTIN: <span className="mono text-[#173d50]">{result.parsed.gtin ?? '—'}</span></p><p>Item: <span className="text-[#173d50]">{resolvedResult?.match.candidates.find((candidate) => candidate.itemId === resolvedResult.itemId)?.itemCode ?? 'เลือกเอง'}</span></p><p>Lot: <span className="mono text-[#173d50]">{result.parsed.lot ?? '—'}</span></p><p>Expiry: <span className="mono text-[#173d50]">{result.parsed.expiry ?? '—'}</span></p></div>{result.match.kind === 'exact_ambiguous' ? <fieldset className="space-y-1 text-xs text-[#8f5f1d]"><legend className="font-semibold">เลือก Item ที่ตรงกับ package</legend>{result.match.candidates.map((candidate) => <label key={candidate.itemId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[#eed4a6] bg-white px-2"><input type="radio" name="package-scan-item" checked={candidateChoice === candidate.itemId} onChange={() => setCandidateChoice(candidate.itemId)} />{candidate.itemCode} · {candidate.name}</label>)}</fieldset> : null}{resolvedResult?.conflicts.length ? <Notice tone="danger">{resolvedResult.conflicts.map((conflict) => conflict.message).join(' ')}</Notice> : null}<Button type="button" disabled={disabled || busy || !canUse} onClick={() => resolvedResult && onUse(resolvedResult)}><CheckCircle2 className="size-4" />ใช้ข้อมูลนี้</Button></div> : null}
  </div>
}
