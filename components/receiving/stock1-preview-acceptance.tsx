'use client'

import { useState } from 'react'
import type { ReceivingWorkspace } from '@/lib/receiving/types'
import { matchKnownLots, type KnownLotMatch, type KnownLotMatchItem } from '@/lib/receiving/known-lot-match'
import { parseBarcode } from '@/lib/receiving/barcode'
import type { BarcodeScanDiagnostics } from '@/lib/receiving/barcode-diagnostics'
import { matchPackageBarcode, type PackageScanCandidate } from '@/lib/receiving/package-scan'
import { Card, Notice, PageHeader, StatusBadge } from '@/components/ui'
import { InvoiceImageCrop, type InvoiceImageCropResult } from '@/components/receiving/invoice-image-crop'
import { InvoiceOcr, type InvoiceOcrPreviewDraft } from '@/components/receiving/invoice-ocr'
import { PackageScan, type PackageScanResponse, type PackageScanResolver } from '@/components/receiving/package-scan'

type PreviewItem = ReceivingWorkspace['items'][number]

const PREVIEW_ITEMS: PreviewItem[] = [
  {
    id: 'preview-item-1011',
    itemCode: 'PREVIEW-REAGENT-1011',
    name: 'Preview reagent 1011 — safe fixture',
    unit: 'box',
    trackLot: true,
    trackExpiry: true,
    catalogNo: '101154997',
    manufacturer: 'Stock1 Fixture Manufacturer',
    supplier: 'Stock1 Fixture Vendor',
  },
  {
    id: 'preview-item-090',
    itemCode: 'PREVIEW-REAGENT-090',
    name: 'Preview reagent 090 — safe fixture',
    unit: 'box',
    trackLot: true,
    trackExpiry: true,
    catalogNo: '090998877',
    manufacturer: 'Stock1 Fixture Manufacturer',
    supplier: 'Stock1 Fixture Vendor',
  },
  {
    id: 'preview-item-001',
    itemCode: 'PREVIEW-REAGENT-001',
    name: 'Preview reagent — safe fixture',
    unit: 'box',
    trackLot: true,
    trackExpiry: true,
    catalogNo: 'CAT-PREVIEW-001',
    manufacturer: 'Stock1 Fixture Manufacturer',
    supplier: 'Stock1 Fixture Vendor',
  },
  {
    id: 'preview-item-002',
    itemCode: 'PREVIEW-REAGENT-002',
    name: 'Preview reagent duplicate GTIN fixture',
    unit: 'box',
    trackLot: true,
    trackExpiry: true,
    catalogNo: 'CAT-PREVIEW-AMB-A',
    manufacturer: 'Stock1 Fixture Manufacturer',
    supplier: 'Stock1 Fixture Vendor',
  },
  {
    id: 'preview-item-003',
    itemCode: 'PREVIEW-REAGENT-003',
    name: 'Preview reagent duplicate GTIN fixture B',
    unit: 'box',
    trackLot: true,
    trackExpiry: true,
    catalogNo: 'CAT-PREVIEW-AMB-B',
    manufacturer: 'Stock1 Fixture Manufacturer',
    supplier: 'Stock1 Fixture Vendor',
  },
]

const PREVIEW_LOTS: KnownLotMatchItem[] = [
  { lotId: 'preview-lot-001', itemId: 'preview-item-001', lotNumber: 'LOT-PREVIEW-001', expiryDate: '2027-12-31', itemCode: 'PREVIEW-REAGENT-001' },
  { lotId: 'preview-lot-002', itemId: 'preview-item-001', lotNumber: 'LOT-PREVIEW-002', expiryDate: '2028-01-31', itemCode: 'PREVIEW-REAGENT-001' },
]

const PREVIEW_UNIQUE_GTIN = '01234567890128'
const PREVIEW_AMBIGUOUS_GTIN = '00012345678905'

const PREVIEW_BARCODE_CANDIDATES: Record<string, PackageScanCandidate[]> = {
  [PREVIEW_UNIQUE_GTIN]: [{ itemId: 'preview-item-001', itemCode: 'PREVIEW-REAGENT-001', name: 'Preview reagent — safe fixture', unit: 'box', packDescription: 'Unique fixture candidate' }],
  [PREVIEW_AMBIGUOUS_GTIN]: [
    { itemId: 'preview-item-002', itemCode: 'PREVIEW-REAGENT-002', name: 'Preview reagent duplicate GTIN fixture', unit: 'box', packDescription: 'Ambiguous fixture candidate A' },
    { itemId: 'preview-item-003', itemCode: 'PREVIEW-REAGENT-003', name: 'Preview reagent duplicate GTIN fixture B', unit: 'box', packDescription: 'Ambiguous fixture candidate B' },
  ],
}

export const resolvePreviewPackage: PackageScanResolver = async ({ raw, symbologyId, stockItemId }) => {
  const parsed = parseBarcode(raw, symbologyId)
  const resolution = matchPackageBarcode(parsed, parsed.gtin ? PREVIEW_BARCODE_CANDIDATES[parsed.gtin] ?? [] : [], stockItemId)
  return { ...resolution, parsed: { ...resolution.parsed, itemId: resolution.itemId } }
}

function knownLotLabel(match: KnownLotMatch) {
  if (match.kind === 'exact_unique') return `exact_unique · ${match.candidate.lotNumber}`
  if (match.kind === 'exact_ambiguous') return `exact_ambiguous · ${match.candidates.length} candidates`
  if (match.kind === 'similar') return `similar · ${match.candidates.length} suggestions`
  return 'none'
}

export function Stock1PreviewAcceptance() {
  const [cropResult, setCropResult] = useState<InvoiceImageCropResult | null>(null)
  const [ocrDraft, setOcrDraft] = useState<{ text: string; lineCount: number; unresolvedCount: number; ignoredCount: number; passCount: number } | null>(null)
  const [knownLotMatch, setKnownLotMatch] = useState<KnownLotMatch | null>(null)
  const [scanResult, setScanResult] = useState<PackageScanResponse | null>(null)
  const [scanDiagnostics, setScanDiagnostics] = useState<BarcodeScanDiagnostics | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function onPreviewDraft(data: InvoiceOcrPreviewDraft) {
    setOcrDraft({ text: data.text, lineCount: data.lines.length, unresolvedCount: data.unresolvedLines.length, ignoredCount: data.ignoredLines.length, passCount: data.passes.length })
    setKnownLotMatch(matchKnownLots(data.text, PREVIEW_LOTS))
    setNotice('OCR draft ถูกเก็บไว้ใน browser ของ Preview เท่านั้น — ไม่มีการเรียก Supabase หรือเขียน stock')
  }

  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
    <PageHeader eyebrow="Stock1 Preview Acceptance" title="Receiving camera / OCR / barcode acceptance" description="หน้านี้ใช้เฉพาะทดสอบบน Preview ด้วย fixture ใน browser — ไม่ใช่ receiving workflow และไม่มีฐานข้อมูลธุรกิจ" />
    <Notice tone="warning">PREVIEW-ONLY: OCR และ barcode resolver ใช้ fixture ใน browser, ไม่มี Supabase credentials, ไม่มี stock mutation endpoint และไม่สร้าง receipt จริง</Notice>
    {notice ? <Notice tone="success">{notice}</Notice> : null}

    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Acceptance scope</p><h2 className="mt-1 text-lg font-bold text-[#173d50]">Phase 2 components</h2></div><StatusBadge tone="accepted" label="safe fixture mode" /></div>
      <ul className="grid gap-2 text-sm text-[#58747d] sm:grid-cols-2">
        <li>Invoice image capture, auto-detect, four-corner drag, reset, retake, skip, perspective correction</li>
        <li>Tesseract.js Thai + English worker with self-hosted assets</li>
        <li>GS1 / HIBC parsing and camera symbology metadata</li>
        <li>Unique, ambiguous, no-match, and known-lot matching demonstrations</li>
      </ul>
    </Card>

    <section aria-labelledby="preview-image-heading" className="space-y-2">
      <h2 id="preview-image-heading" className="text-lg font-bold text-[#173d50]">1. Invoice image and crop</h2>
      <InvoiceImageCrop onConfirmed={(result) => { setCropResult(result); setNotice(result.skipped ? 'เลือก Skip Crop แล้ว — ภาพยังไม่ถูกส่งออกนอก browser' : 'ยืนยัน perspective correction แล้ว — ภาพ corrected พร้อมสำหรับ OCR') }} />
      {cropResult ? <Card className="space-y-2 border-[#b8ded8] bg-[#f4fbf9] p-4"><details><summary className="cursor-pointer text-sm font-semibold text-[#315763]">CROP diagnostics — original dimensions / auto-detect / corners</summary><div className="mt-2 space-y-1 text-xs text-[#58747d]"><p>original image: {cropResult.imageSize ? `${cropResult.imageSize.width}×${cropResult.imageSize.height}px` : 'n/a'}</p><p>skipped crop: {String(cropResult.skipped)} · auto-detect: {cropResult.skipped ? 'n/a' : cropResult.autoDetected ? 'detected — corners may still be manually adjusted before confirm' : 'not detected — manual four-corner fallback used'}</p>{cropResult.cropCorners && cropResult.imageSize ? <div><p className="font-semibold text-[#315763]">Four original-image coordinates (normalized · pixels)</p>{(['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const).map((key) => <p key={key}>{key}: ({cropResult.cropCorners![key].x.toFixed(4)}, {cropResult.cropCorners![key].y.toFixed(4)}) · ({Math.round(cropResult.cropCorners![key].x * cropResult.imageSize!.width)}px, {Math.round(cropResult.cropCorners![key].y * cropResult.imageSize!.height)}px)</p>)}</div> : null}</div></details></Card> : null}
    </section>

    <section aria-labelledby="preview-ocr-heading" className="space-y-2">
      <h2 id="preview-ocr-heading" className="text-lg font-bold text-[#173d50]">2. Tesseract.js OCR and matching</h2>
      <InvoiceOcr
        processedImage={cropResult?.processedImage ?? null}
        vendorId="preview-fixture-vendor"
        invoiceNo="PREVIEW-ONLY"
        invoiceDate="2026-09-18"
        items={PREVIEW_ITEMS}
        previewOnly
        onPreviewDraft={onPreviewDraft}
        onSaved={() => undefined}
        onError={setNotice}
      />
      {ocrDraft ? <Card className="space-y-2 border-[#b8ded8] bg-[#f4fbf9] p-4"><p className="font-semibold text-[#315763]">Browser-only OCR result captured</p><p className="text-sm text-[#58747d]">{ocrDraft.lineCount} identified candidate line(s) · {ocrDraft.unresolvedCount} unresolved · {ocrDraft.ignoredCount} ignored noise line(s) · {ocrDraft.passCount} OCR pass(es) · {ocrDraft.text.length} characters · known lot result: <span className="font-semibold">{knownLotMatch ? knownLotLabel(knownLotMatch) : 'not evaluated'}</span></p>{knownLotMatch?.kind === 'exact_ambiguous' ? <p className="text-xs text-[#8f5f1d]">Ambiguous lot candidates: {knownLotMatch.candidates.map((candidate) => candidate.lotNumber).join(', ')}</p> : null}</Card> : null}
    </section>

    <section aria-labelledby="preview-barcode-heading" className="space-y-2">
      <h2 id="preview-barcode-heading" className="text-lg font-bold text-[#173d50]">3. Camera barcode / DataMatrix / GS1 / HIBC</h2>
      <PackageScan selectedItemId={null} resolveScan={resolvePreviewPackage} onScanDiagnostics={setScanDiagnostics} onUse={(result) => { setScanResult(result); setNotice('Barcode result ถูกใช้ใน draft ของ browser เท่านั้น — ไม่มีการเขียน stock') }} />
      {scanResult ? <Card className="space-y-2 border-[#b8ded8] bg-[#f4fbf9] p-4"><p className="font-semibold text-[#315763]">Parsed result</p><div className="grid gap-2 text-sm text-[#58747d] sm:grid-cols-2"><p>Standard: <span className="font-semibold">{scanResult.parsed.standard ?? 'none'}</span></p><p>Symbology: <span className="font-semibold">{scanResult.parsed.symbologyId ?? 'none'}</span></p><p>GTIN: <span className="font-semibold">{scanResult.parsed.gtin ?? 'none'}</span></p><p>Catalog / REF: <span className="font-semibold">{scanResult.parsed.catalog ?? 'none'}</span></p><p>Lot: <span className="font-semibold">{scanResult.parsed.lot ?? 'none'}</span></p><p>Expiry: <span className="font-semibold">{scanResult.parsed.expiry ?? 'none'}</span></p><p>Manufacture date: <span className="font-semibold">{scanResult.parsed.manufactureDate ?? 'none'}</span></p><p>AI 240 / Additional Product ID: <span className="font-semibold">{scanResult.parsed.additionalProductId ?? 'none'}</span></p></div>{scanResult.parsed.catalogCandidate ? <Notice tone="info">Catalog/REF candidate: <span className="mono">{scanResult.parsed.catalogCandidate.value}</span> — {scanResult.parsed.catalogCandidate.reason}</Notice> : null}<p className="text-xs text-[#81979c]">Match: {scanResult.match.kind} · conflicts: {scanResult.conflicts.length}</p></Card> : null}
      {scanDiagnostics ? <Card className="space-y-2 border-[#b8ded8] bg-[#f4fbf9] p-4"><details><summary className="cursor-pointer text-sm font-semibold text-[#315763]">DATAMATRIX diagnostics — raw bytes / symbology / normalized GS1</summary><div className="mt-2 space-y-1 text-xs text-[#58747d]"><p>barcode format (ZXing numeric enum): {scanDiagnostics.barcodeFormat ?? 'n/a'}</p><p>symbology identifier: {scanDiagnostics.symbologyId ?? 'none — @zxing/library exposes no AIM symbology identifier; derived from barcode format instead'}</p><p>escaped raw payload: <span className="mono">{scanDiagnostics.rawEscaped}</span></p><p>raw bytes (hex): <span className="mono">{scanDiagnostics.rawBytesHex ?? 'n/a'}</span></p><p className="font-semibold text-[#315763]">Parsed GS1/HIBC AIs</p><p>standard: {scanDiagnostics.parsed.standard ?? 'none'} · GTIN: {scanDiagnostics.parsed.gtin ?? 'none'} · Lot: {scanDiagnostics.parsed.lot ?? 'none'} · Expiry: {scanDiagnostics.parsed.expiry ?? 'none'} · Manufacture date: {scanDiagnostics.parsed.manufactureDate ?? 'none'} · Catalog/REF: {scanDiagnostics.parsed.catalog ?? 'none'}</p><p>AI 240 / Additional Product ID: {scanDiagnostics.parsed.additionalProductId ?? 'none'}</p><p>Catalog/REF candidate: {scanDiagnostics.parsed.catalogCandidate ? <>{scanDiagnostics.parsed.catalogCandidate.value} — <span className="italic">{scanDiagnostics.parsed.catalogCandidate.reason}</span></> : 'none proposed'}</p></div></details></Card> : null}
    </section>

    <Card className="border-[#e7d6b0] bg-[#fffaf0] p-4 text-sm text-[#76551c]"><p className="font-semibold">Safety boundary</p><p className="mt-1">This route is runtime-gated to Vercel Preview plus <code>STOCK1_PREVIEW_ACCEPTANCE_MODE=true</code>. It is 404 in production. Do not use it to create invoices, receipts, lots, transactions, attachments, or stock changes.</p></Card>
  </main>
}
