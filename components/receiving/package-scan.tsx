'use client'

import { useState } from 'react'
import { Camera, CheckCircle2, ScanLine, X } from 'lucide-react'
import type { CameraScanResult } from '@/components/camera-scanner'
import { barcodeFormatName, useCameraScanner } from '@/components/camera-scanner'
import type { ParsedBarcode } from '@/lib/receiving/barcode'
import { describeBarcodeScan, type BarcodeScanDiagnostics } from '@/lib/receiving/barcode-diagnostics'
import type { PackageScanResolution } from '@/lib/receiving/package-scan'
import { resolveScanPayload } from '@/lib/receiving/scan-text'
import { api, Button, Field, Input, Notice, StatusBadge } from '@/components/ui'

export type PackageScanResponse = PackageScanResolution & {
  parsed: ParsedBarcode & { itemId: string | null }
}

export type PackageScanResolver = (input: { raw: string; symbologyId: string | null; stockItemId: string | null }) => Promise<PackageScanResponse>

/**
 * Package DataMatrix / GS1-128 / HIBC scan. A clean scan fills Lot and Expiry
 * straight away. An exact, unique GTIN mapping may *propose* an Item, but the
 * Item is always the user's choice; ambiguous GTINs require a pick and GTIN or
 * AI 240 never become Catalog/REF.
 */
export function PackageScan({
  selectedItemId,
  disabled = false,
  onUse,
  resolveScan,
  onScanDiagnostics,
}: {
  selectedItemId: string | null
  disabled?: boolean
  onUse: (result: PackageScanResponse) => void
  resolveScan?: PackageScanResolver
  /** Preview-only: raw/escaped payload, hex bytes, symbology, and parsed AIs for a camera scan. */
  onScanDiagnostics?: (diagnostics: BarcodeScanDiagnostics) => void
}) {
  const [raw, setRaw] = useState('')
  const [symbologyId, setSymbologyId] = useState<string | null>(null)
  const [result, setResult] = useState<PackageScanResponse | null>(null)
  const [candidateChoice, setCandidateChoice] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function parse(payload = raw, identifier = symbologyId) {
    const nextRaw = payload.trim()
    if (!nextRaw) return
    setBusy(true)
    setError(null)
    setApplied(false)
    try {
      const response = resolveScan
        ? await resolveScan({ raw: nextRaw, symbologyId: identifier, stockItemId: selectedItemId || null })
        : await api<PackageScanResponse>('/api/receiving/scan/parse', {
          method: 'POST',
          body: JSON.stringify({ raw: nextRaw, symbologyId: identifier, stockItemId: selectedItemId || null }),
        })
      setResult(response)
      setCandidateChoice(null)
      const hasData = Boolean(response.parsed.lot || response.parsed.expiry || response.parsed.gtin)
      if (!response.parsed.standard) setError('อ่าน barcode ได้ แต่ไม่ใช่ GS1/HIBC ที่รองรับ — กรอก Lot/Expiry เอง')
      else if (hasData && response.conflicts.length === 0) {
        onUse(response)
        setApplied(true)
      }
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
      const payload = resolveScanPayload({
        text: code,
        symbologyId: identifier,
        rawBytes: details?.rawBytes ?? null,
        isDataMatrix: barcodeFormatName(details?.barcodeFormat ?? null) === 'DATA_MATRIX',
      })
      setRaw(payload.text)
      setSymbologyId(identifier)
      onScanDiagnostics?.(describeBarcodeScan({
        raw: payload.text,
        symbologyId: identifier,
        rawBytes: details?.rawBytes ?? null,
        barcodeFormat: details?.barcodeFormat ?? null,
      }))
      void parse(payload.text, identifier)
    },
    onError: setError,
    stopOnScan: true,
  })

  function useCandidate() {
    if (!result || !candidateChoice) return
    const chosen = { ...result, itemId: candidateChoice, match: { ...result.match, itemId: candidateChoice }, conflicts: [] }
    onUse({ ...chosen, parsed: { ...chosen.parsed, itemId: candidateChoice } })
    setApplied(true)
  }

  const parsed = result?.parsed
  const matchTone = result?.match.kind === 'exact_unique' ? 'accepted' : result?.match.kind === 'exact_ambiguous' ? 'investigate' : 'neutral'
  const matchLabel = result?.match.kind === 'exact_unique'
    ? 'GTIN ตรงกับ Item เดียว'
    : result?.match.kind === 'exact_ambiguous'
      ? (result.conflicts.length ? 'GTIN ตรงหลาย Item — ต้องเลือกเอง' : 'GTIN ตรงกับ Item ที่เลือก')
      : 'ไม่พบ GTIN ใน Item Master — เลือก Item เอง'

  return <div className="space-y-3 rounded-md border border-[#cfe1e2] bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-xs font-bold text-[#315763]">สแกน DataMatrix / GS1 / HIBC</p><p className="mt-1 text-[11px] text-[#81979c]">เติม Lot และวันหมดอายุอัตโนมัติ — ยังไม่บันทึก stock</p></div>
      {result && parsed?.standard ? <StatusBadge tone={matchTone} label={matchLabel} /> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={disabled || busy} onClick={toggle}>{cameraOn ? <X className="size-4" /> : <Camera className="size-4" />} {cameraOn ? 'ปิดกล้อง' : 'สแกนด้วยกล้อง'}</Button>
      {symbologyId ? <span className="inline-flex min-h-11 items-center gap-1 rounded-md border border-[#dce8e9] px-3 text-xs text-[#58747d]"><ScanLine className="size-4" />{symbologyId}</span> : null}
    </div>
    {cameraOn ? <div className="relative overflow-hidden rounded-md border border-[#d6e2e3] bg-black"><video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="aspect-square h-[62%] rounded-lg border-2 border-[#5de1d0] shadow-[0_0_0_999px_rgba(0,0,0,.22),0_0_18px_rgba(93,225,208,.8)]" /></div></div> : null}
    <details className="text-xs text-[#58747d]">
      <summary className="cursor-pointer py-1 font-semibold">พิมพ์ / วาง payload หรือใช้เครื่องสแกนแบบ keyboard</summary>
      <Field label="Raw payload" hint="รองรับ ]d2, FNC1/<GS>, ASCII 29"><div className="flex gap-2"><Input value={raw} onChange={(event) => { setRaw(event.target.value); setResult(null); setApplied(false) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void parse() } }} disabled={disabled || busy} className="mono" placeholder="Scan หรือวาง GS1/HIBC payload" /><Button type="button" variant="secondary" disabled={disabled || busy || !raw.trim()} onClick={() => void parse()}>อ่าน</Button></div></Field>
    </details>
    {error ? <Notice tone="warning">{error}</Notice> : null}
    {result && parsed?.standard ? <div className="space-y-2 rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3">
      <div className="grid gap-2 text-xs text-[#58747d] sm:grid-cols-2">
        <p>Lot: <span className="mono font-semibold text-[#173d50]">{parsed.lot ?? 'ไม่มีใน barcode — กรอกเอง'}</span></p>
        <p>Expiry: <span className="mono font-semibold text-[#173d50]">{parsed.expiry ?? 'ไม่มีใน barcode — กรอกเอง'}</span></p>
      </div>
      {applied ? <p className="flex items-center gap-1 text-xs font-semibold text-[#2f7d44]"><CheckCircle2 className="size-4" />เติมข้อมูลจาก barcode แล้ว — ตรวจสอบก่อนยืนยัน</p> : null}
      {result.match.kind === 'exact_ambiguous' && result.conflicts.length ? <fieldset className="space-y-1 text-xs text-[#8f5f1d]"><legend className="font-semibold">GTIN นี้ผูกกับหลาย Item — เลือก Item ที่ตรงกับ package</legend>{result.match.candidates.map((candidate) => <label key={candidate.itemId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[#eed4a6] bg-white px-2"><input type="radio" name="package-scan-item" checked={candidateChoice === candidate.itemId} onChange={() => setCandidateChoice(candidate.itemId)} />{candidate.itemCode} · {candidate.name}</label>)}<Button type="button" disabled={disabled || busy || !candidateChoice} onClick={useCandidate}><CheckCircle2 className="size-4" />ใช้ Item นี้</Button></fieldset> : null}
      {result.conflicts.some((conflict) => conflict.code === 'barcode_item_mismatch') ? <Notice tone="danger">{result.conflicts.map((conflict) => conflict.message).join(' ')} — ไม่ได้เติมข้อมูล ตรวจสอบ Item หรือสแกนใหม่</Notice> : null}
      <details className="text-xs text-[#58747d]">
        <summary className="cursor-pointer py-1 font-semibold">ข้อมูล barcode เพิ่มเติม</summary>
        <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <div><dt className="inline">GTIN (AI 01): </dt><dd className="mono inline">{parsed.gtin ?? '—'}</dd></div>
          <div><dt className="inline">AI 240: </dt><dd className="mono inline">{parsed.additionalProductId ?? '—'}</dd></div>
          <div><dt className="inline">Manufacture (AI 11): </dt><dd className="mono inline">{parsed.manufactureDate ?? '—'}</dd></div>
          <div><dt className="inline">Best before (AI 15): </dt><dd className="mono inline">{parsed.bestBeforeDate ?? '—'}</dd></div>
          <div><dt className="inline">Serial (AI 21): </dt><dd className="mono inline">{parsed.serial ?? '—'}</dd></div>
          <div><dt className="inline">Standard / Symbology: </dt><dd className="mono inline">{parsed.standard ?? '—'} · {parsed.symbologyId ?? '—'}</dd></div>
        </dl>
        <p className="mt-1 text-[11px] text-[#81979c]">GTIN และ AI 240 เก็บเป็นหลักฐานเท่านั้น ไม่ใช้แทน Catalog/REF</p>
        {parsed.catalogCandidate ? <p className="mt-1 text-[11px] text-[#8f5f1d]">หมายเหตุผู้ผลิต: {parsed.catalogCandidate.reason}</p> : null}
      </details>
    </div> : null}
  </div>
}
