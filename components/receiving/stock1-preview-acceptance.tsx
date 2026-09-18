'use client'

import { useState } from 'react'
import type { ReceivingWorkspace } from '@/lib/receiving/types'
import { matchKnownLots, type KnownLotMatch, type KnownLotMatchItem } from '@/lib/receiving/known-lot-match'
import { parseBarcode } from '@/lib/receiving/barcode'
import { matchPackageBarcode, type PackageScanCandidate } from '@/lib/receiving/package-scan'
import { Card, Notice, PageHeader, StatusBadge } from '@/components/ui'
import { InvoiceImageCrop, type InvoiceImageCropResult } from '@/components/receiving/invoice-image-crop'
import { InvoiceOcr } from '@/components/receiving/invoice-ocr'
import { PackageScan, type PackageScanResponse, type PackageScanResolver } from '@/components/receiving/package-scan'

type PreviewItem = ReceivingWorkspace['items'][number]

const PREVIEW_ITEMS: PreviewItem[] = [
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
  const [ocrDraft, setOcrDraft] = useState<{ text: string; lineCount: number } | null>(null)
  const [knownLotMatch, setKnownLotMatch] = useState<KnownLotMatch | null>(null)
  const [scanResult, setScanResult] = useState<PackageScanResponse | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function onPreviewDraft(data: { text: string; lines: { lineNo: number }[] }) {
    setOcrDraft({ text: data.text, lineCount: data.lines.length })
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
      {ocrDraft ? <Card className="space-y-2 border-[#b8ded8] bg-[#f4fbf9] p-4"><p className="font-semibold text-[#315763]">Browser-only OCR result captured</p><p className="text-sm text-[#58747d]">{ocrDraft.lineCount} line(s) · {ocrDraft.text.length} characters · known lot result: <span className="font-semibold">{knownLotMatch ? knownLotLabel(knownLotMatch) : 'not evaluated'}</span></p>{knownLotMatch?.kind === 'exact_ambiguous' ? <p className="text-xs text-[#8f5f1d]">Ambiguous lot candidates: {knownLotMatch.candidates.map((candidate) => candidate.lotNumber).join(', ')}</p> : null}</Card> : null}
    </section>

    <section aria-labelledby="preview-barcode-heading" className="space-y-2">
      <h2 id="preview-barcode-heading" className="text-lg font-bold text-[#173d50]">3. Camera barcode / DataMatrix / GS1 / HIBC</h2>
      <PackageScan selectedItemId={null} resolveScan={resolvePreviewPackage} onUse={(result) => { setScanResult(result); setNotice('Barcode result ถูกใช้ใน draft ของ browser เท่านั้น — ไม่มีการเขียน stock') }} />
      {scanResult ? <Card className="space-y-2 border-[#b8ded8] bg-[#f4fbf9] p-4"><p className="font-semibold text-[#315763]">Parsed result</p><div className="grid gap-2 text-sm text-[#58747d] sm:grid-cols-2"><p>Standard: <span className="font-semibold">{scanResult.parsed.standard ?? 'none'}</span></p><p>Symbology: <span className="font-semibold">{scanResult.parsed.symbologyId ?? 'none'}</span></p><p>GTIN: <span className="font-semibold">{scanResult.parsed.gtin ?? 'none'}</span></p><p>Catalog / REF: <span className="font-semibold">{scanResult.parsed.catalog ?? 'none'}</span></p><p>Lot: <span className="font-semibold">{scanResult.parsed.lot ?? 'none'}</span></p><p>Expiry: <span className="font-semibold">{scanResult.parsed.expiry ?? 'none'}</span></p></div><p className="text-xs text-[#81979c]">Match: {scanResult.match.kind} · conflicts: {scanResult.conflicts.length}</p></Card> : null}
    </section>

    <Card className="border-[#e7d6b0] bg-[#fffaf0] p-4 text-sm text-[#76551c]"><p className="font-semibold">Safety boundary</p><p className="mt-1">This route is runtime-gated to Vercel Preview plus <code>STOCK1_PREVIEW_ACCEPTANCE_MODE=true</code>. It is 404 in production. Do not use it to create invoices, receipts, lots, transactions, attachments, or stock changes.</p></Card>
  </main>
}
