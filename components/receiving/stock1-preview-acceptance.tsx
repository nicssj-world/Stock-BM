'use client'

import { useMemo, useState } from 'react'
import { receiptQuantitySummary, type ReceiptAssessment, type ReceiptAssessmentAnswers } from '@/lib/receiving/assessment'
import { parseBarcode } from '@/lib/receiving/barcode'
import { escapeBarcodeText, type BarcodeScanDiagnostics } from '@/lib/receiving/barcode-diagnostics'
import { matchPackageBarcode, type PackageScanCandidate } from '@/lib/receiving/package-scan'
import type { Invoice, Receipt, ReceiptLine, ReceivingWorkspace, Vendor } from '@/lib/receiving/types'
import { buildVendorMetrics } from '@/lib/vendors/metrics'
import type { VendorMetrics } from '@/lib/vendors/types'
import { vendorFiscalYearFor, vendorFiscalYearLabel } from '@/lib/vendors/fiscal-year'
import { barcodeFormatName } from '@/components/camera-scanner'
import { Button, Card, Notice, PageHeader, StatusBadge, Tabs } from '@/components/ui'
import type { PackageScanResolver } from '@/components/receiving/package-scan'
import { ReceiptAssessmentDialog, type ReceiptAssessmentContext } from '@/components/receiving/receipt-assessment-dialog'
import { ReceiveWizard, type ReceiveAdapter, type ReceiveSubmission } from '@/components/receiving/receive-wizard'
import { VendorMetricsPanel } from '@/components/vendors/vendor-metrics-panel'

// ---------------------------------------------------------------------------
// Browser-only fixtures. Nothing here reaches Supabase, an API route, or the
// stock ledger: "confirm" is simulated in React state.
// ---------------------------------------------------------------------------

const NOW = '2026-09-18T03:00:00.000Z'
const ACTOR = 'preview-actor'

const PREVIEW_VENDORS: Vendor[] = [
  { id: 'preview-vendor-roche', code: 'V-ROCHE', name: 'Roche Diagnostics (Thailand) — fixture', taxId: '0105500000000', address: '— preview fixture address —', phone: '02-000-0000', email: 'orders@example.invalid', contactPerson: 'Fixture contact', isActive: true, note: 'Preview fixture only', createdBy: ACTOR, createdAt: NOW, updatedAt: NOW, itemCount: 1 },
  { id: 'preview-vendor-b', code: 'V-FIXTURE-B', name: 'Fixture reagent supplier B', taxId: null, address: null, phone: '038-000-000', email: null, contactPerson: 'Fixture B', isActive: true, note: null, createdBy: ACTOR, createdAt: NOW, updatedAt: NOW, itemCount: 3 },
  { id: 'preview-vendor-inactive', code: 'V-OLD', name: 'Inactive fixture vendor', taxId: null, address: null, phone: null, email: null, contactPerson: null, isActive: false, note: 'แสดงสถานะ inactive', createdBy: ACTOR, createdAt: NOW, updatedAt: NOW, itemCount: 0 },
]

const PREVIEW_ITEMS: ReceivingWorkspace['items'] = [
  { id: 'preview-item-tpuc3', itemCode: 'CHEM-TPUC3', name: 'cobas TPUC3 Total Protein Urine/CSF Gen.3 — fixture', unit: 'box', trackLot: true, trackExpiry: true, catalogNo: '08058679190', manufacturer: 'Roche', supplier: 'Roche Diagnostics' },
  { id: 'preview-item-b', itemCode: 'REAG-B', name: 'Second reagent (GTIN 00382903403837) — fixture', unit: 'kit', trackLot: true, trackExpiry: true, catalogNo: 'FIX-REF-B-100', manufacturer: 'Fixture Manufacturer B', supplier: 'Fixture supplier B' },
  { id: 'preview-item-amb-a', itemCode: 'REAG-AMB-A', name: 'Duplicate-GTIN fixture A', unit: 'box', trackLot: true, trackExpiry: true, catalogNo: 'FIX-AMB-A', manufacturer: 'Fixture Manufacturer B', supplier: null },
  { id: 'preview-item-amb-b', itemCode: 'REAG-AMB-B', name: 'Duplicate-GTIN fixture B', unit: 'box', trackLot: true, trackExpiry: true, catalogNo: 'FIX-AMB-B', manufacturer: 'Fixture Manufacturer B', supplier: null },
]

const PREVIEW_LOCATIONS: ReceivingWorkspace['locations'] = [
  { id: 'preview-location-fridge', code: 'FRIDGE-1', name: 'ตู้เย็น 2–8 °C (fixture)', isActive: true },
  { id: 'preview-location-room', code: 'ROOM', name: 'อุณหภูมิห้อง (fixture)', isActive: true },
]

const PREVIEW_INVOICE: Invoice = {
  id: 'preview-invoice-1', vendorId: 'preview-vendor-roche', invoiceNo: 'INV-PREVIEW-001', invoiceDate: '2026-09-15', status: 'open', source: 'manual', note: null, createdBy: ACTOR, createdAt: NOW, updatedAt: NOW,
  lines: [{ id: 'preview-invoice-line-1', invoiceId: 'preview-invoice-1', lineNo: 1, stockItemId: 'preview-item-tpuc3', catalogNoText: '08058679190', descriptionText: 'cobas TPUC3', expectedQty: 10, lotText: null, expiryText: null, matchMethod: 'manual', matchConfidence: null, closureState: 'open', shortReasonCode: null, shortReasonNote: null, sortOrder: 1, createdAt: NOW }],
}

// Only GTINs already recorded in the barcode mapping can propose an Item.
const PREVIEW_BARCODE_CANDIDATES: Record<string, PackageScanCandidate[]> = {
  '07613336121535': [{ itemId: 'preview-item-tpuc3', itemCode: 'CHEM-TPUC3', name: 'cobas TPUC3 Total Protein Urine/CSF Gen.3 — fixture', unit: 'box', packDescription: 'Unique mapping fixture' }],
  '09501101530013': [
    { itemId: 'preview-item-amb-a', itemCode: 'REAG-AMB-A', name: 'Duplicate-GTIN fixture A', unit: 'box', packDescription: 'Ambiguous fixture A' },
    { itemId: 'preview-item-amb-b', itemCode: 'REAG-AMB-B', name: 'Duplicate-GTIN fixture B', unit: 'box', packDescription: 'Ambiguous fixture B' },
  ],
}

export const resolvePreviewPackage: PackageScanResolver = async ({ raw, symbologyId, stockItemId }) => {
  const parsed = parseBarcode(raw, symbologyId)
  const resolution = matchPackageBarcode(parsed, parsed.gtin ? PREVIEW_BARCODE_CANDIDATES[parsed.gtin] ?? [] : [], stockItemId)
  return { ...resolution, parsed: { ...resolution.parsed, itemId: resolution.itemId } }
}

const GS = '\u001d'
// Real label AI streams (fixtures A and B) plus a duplicate-GTIN case.
const SAMPLE_PAYLOADS = [
  { label: 'Fixture A — Roche cobas TPUC3 (unique GTIN mapping)', raw: ['240', '08058679190', GS, '01', '07613336121535', '10', '94146701', GS, '17', '270531', '11', '251229'].join('') },
  { label: 'Fixture B — GTIN 00382903403837 (no mapping → choose Item manually)', raw: ['01', '00382903403837', '17', '270531', '10', '06696', GS, '240', '0933'].join('') },
  { label: 'Ambiguous GTIN (two Items share it)', raw: ['01', '09501101530013', '17', '281231', '10', 'AMB-LOT'].join('') },
]

function receiptLine(receiptId: string, index: number, input: ReceiveSubmission['lines'][number]): ReceiptLine {
  return {
    id: `${receiptId}-line-${index + 1}`, receiptId, lineNo: input.lineNo, invoiceLineId: input.invoiceLineId ?? null, stockItemId: input.stockItemId, stockLotId: null,
    lotNumber: input.lotNumber ?? null, expiryDate: input.expiryDate ?? null, lotMode: input.lotMode ?? 'new', locationId: input.locationId, expectedQty: input.expectedQty ?? null, receivedQty: input.receivedQty,
    barcodeRaw: input.barcodeRaw ?? null, barcodeSymbology: input.barcodeSymbology ?? null, barcodeStandard: input.barcodeStandard ?? null, barcodeGtin: input.barcodeGtin ?? null, barcodeLot: input.barcodeLot ?? null, barcodeExpiry: input.barcodeExpiry ?? null,
    barcodeAdditionalProductId: input.barcodeAdditionalProductId ?? null, barcodeManufactureDate: input.barcodeManufactureDate ?? null, barcodeBestBefore: input.barcodeBestBefore ?? null, barcodeSerial: input.barcodeSerial ?? null,
    torThresholdMonths: 6, torExpiryCompliance: input.torExpiryCompliance ?? 'not_applicable', remainingShelfLifeDays: input.remainingShelfLifeDays ?? null, receiptDecision: input.receiptDecision ?? 'accepted',
    acceptanceReasonCode: input.acceptanceReasonCode ?? null, acceptanceReasonNote: input.acceptanceReasonNote ?? null, acceptedBy: null, acceptedAt: null, conflicts: [], sortOrder: index + 1, createdAt: NOW, updatedAt: NOW,
  }
}

type PreviewTab = 'receive' | 'vendors' | 'performance' | 'evaluation'

export function Stock1PreviewAcceptance() {
  const [tab, setTab] = useState<PreviewTab>('receive')
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [assessments, setAssessments] = useState<ReceiptAssessment[]>([])
  const [evidenceLog, setEvidenceLog] = useState<Record<string, string>>({})
  const [dialog, setDialog] = useState<ReceiptAssessmentContext | null>(null)
  const [diagnostics, setDiagnostics] = useState<BarcodeScanDiagnostics | null>(null)
  const [performanceVendorId, setPerformanceVendorId] = useState(PREVIEW_VENDORS[0].id)
  const [snapshot, setSnapshot] = useState<{ vendorId: string; metrics: VendorMetrics; frozenAt: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fiscalYear = vendorFiscalYearFor('2026-09-18')

  const workspace: ReceivingWorkspace = useMemo(() => ({
    vendors: PREVIEW_VENDORS,
    invoices: [PREVIEW_INVOICE],
    receipts,
    items: PREVIEW_ITEMS,
    locations: PREVIEW_LOCATIONS,
    assessments,
    policy: { id: 'preview-policy', version: 1, isEnabled: true, expiryExceptionEnabled: false, expiryExceptionMinRole: null, expiryExceptionRequiresSecondApproval: null, isApproved: false },
  }), [receipts, assessments])

  const adapter: ReceiveAdapter = {
    resolveScan: resolvePreviewPackage,
    onScanDiagnostics: setDiagnostics,
    async submit(submission) {
      const receiptId = `preview-receipt-${receipts.length + 1}`
      const receipt: Receipt = {
        id: receiptId, receiptNo: submission.receiptNo ?? `PREVIEW-R${receipts.length + 1}`, invoiceId: submission.invoiceId, vendorId: submission.vendorId, receivedAt: new Date().toISOString(), receivedDate: submission.receivedDate, receivedBy: ACTOR,
        packagingStatus: null, packagingNote: null, temperatureStatus: null, temperatureValueC: null, temperatureNote: null, coldChainApplicable: false, status: 'confirmed', stockTransactionId: null,
        confirmedAt: new Date().toISOString(), confirmedBy: ACTOR, source: submission.lines.some((line) => line.barcodeRaw) ? 'scan' : 'manual', note: 'Preview simulation — no ledger write', createdBy: ACTOR, createdAt: NOW, updatedAt: NOW,
        lines: submission.lines.map((line, index) => receiptLine(receiptId, index, line)),
      }
      setReceipts((current) => [...current, receipt])
      // Mirrors the database trigger: a confirmed receipt always has a Pending assessment.
      setAssessments((current) => [...current, { id: `${receiptId}-assessment`, receiptId, vendorId: submission.vendorId, status: 'pending', productCondition: null, documentation: null, itemCorrectness: null, coldChainApplicable: null, coldChainCondition: null, hasComplaint: null, note: null, assessedBy: null, assessedAt: null, createdAt: NOW, updatedAt: NOW }])
      if (submission.evidence) setEvidenceLog((current) => ({ ...current, [receiptId]: submission.evidence!.previewUrl }))
      setNotice(`SIMULATED CONFIRM: ${receipt.receiptNo} — ไม่มีการเรียก API หรือเขียน stock`)
      return { receiptId, receiptLabel: receipt.receiptNo ?? receiptId }
    },
  }

  async function saveAssessment(receiptId: string, answers: ReceiptAssessmentAnswers) {
    setAssessments((current) => current.map((item) => item.receiptId === receiptId ? { ...item, ...answers, note: answers.note || null, status: 'completed', assessedBy: ACTOR, assessedAt: new Date().toISOString() } : item))
    setDialog(null)
    setNotice('บันทึกการประเมินใน browser แล้ว — ตัวชี้วัด Vendor Performance อัปเดตจากข้อมูลนี้')
  }

  const vendorMetrics = useMemo(() => {
    const vendorReceipts = receipts.filter((receipt) => receipt.vendorId === performanceVendorId)
    const invoiceLines = PREVIEW_INVOICE.vendorId === performanceVendorId ? PREVIEW_INVOICE.lines : []
    return buildVendorMetrics({
      fiscalYear,
      completeDelivery: invoiceLines.map((line) => ({ id: line.id, closureState: line.closureState })),
      shelfLife: vendorReceipts.flatMap((receipt) => receipt.lines.map((line) => ({ id: line.id, receiptId: receipt.id, compliance: line.torExpiryCompliance }))),
      assessments: assessments.filter((item) => item.vendorId === performanceVendorId),
      quantityLines: invoiceLines.map((line) => ({ id: line.id, expectedQty: line.expectedQty, receivedQty: receipts.flatMap((receipt) => receipt.lines).filter((candidate) => candidate.invoiceLineId === line.id).reduce((sum, candidate) => sum + candidate.receivedQty, 0) })),
      issues: [],
      deliveryDates: vendorReceipts.map((receipt) => ({ invoiceDate: receipt.invoiceId ? PREVIEW_INVOICE.invoiceDate : null, receivedDate: receipt.receivedDate })),
      coldChainMappingApproved: false,
    })
  }, [assessments, fiscalYear, performanceVendorId, receipts])

  const receiptLabel = (id: string) => receipts.find((receipt) => receipt.id === id)?.receiptNo ?? id
  const pending = assessments.filter((item) => item.status === 'pending')

  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
    <PageHeader eyebrow="Stock1 Preview Acceptance" title="Receiving final workflow" description="ทดสอบ workflow ที่อนุมัติ: รูปใบส่งของ (หลักฐาน) → crop สี่เหลี่ยม → เลือก Item → สแกน DataMatrix → Lot/Expiry → จำนวน → ตรวจสอบ → ยืนยัน (จำลอง) → ประเมินการรับสินค้า" />
    <Notice tone="warning">PREVIEW-ONLY · fixture ใน browser เท่านั้น · ไม่มี Supabase credentials · ไม่มีการเรียก API · ไม่มี stock mutation — การยืนยันเป็นการจำลอง</Notice>
    {notice ? <Notice tone="success">{notice}</Notice> : null}

    <Tabs tabs={[{ key: 'receive' as const, label: 'รับเข้า' }, { key: 'vendors' as const, label: 'Vendor Registry' }, { key: 'performance' as const, label: 'Vendor Performance' }, { key: 'evaluation' as const, label: 'Annual Evaluation' }]} active={tab} onChange={setTab} />

    {tab === 'receive' ? <div className="space-y-4">
      {pending.length ? <Card className="space-y-2 border-[#eed4a6] bg-[#fffaf0] p-4"><p className="text-sm font-bold text-[#8f5f1d]">การประเมินที่รอดำเนินการ (Pending) · {pending.length}</p>{pending.map((item) => { const receipt = receipts.find((candidate) => candidate.id === item.receiptId); return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{receipt?.receiptNo ?? item.receiptId}</span>{receipt ? <Button type="button" variant="secondary" onClick={() => setDialog(contextFor(receipt))}>ประเมิน</Button> : null}</div> })}</Card> : null}
      <ReceiveWizard data={workspace} adapter={adapter} onReceived={({ assessment }) => setDialog(assessment)} onError={setNotice} />
      <Card className="space-y-2 p-4">
        <p className="text-sm font-bold text-[#173d50]">Payload ตัวอย่าง (วางในช่อง “พิมพ์ / วาง payload”)</p>
        <p className="text-xs text-[#81979c]">คัดลอกข้อความที่มี &lt;GS&gt; ได้ — parser รองรับ &lt;GS&gt; / FNC1 / ASCII 29</p>
        <ul className="space-y-2">{SAMPLE_PAYLOADS.map((sample) => <li key={sample.label} className="rounded-md border border-[#dce8e9] p-2 text-xs"><p className="font-semibold text-[#315763]">{sample.label}</p><p className="mono mt-1 break-all text-[#58747d]">]d2{escapeBarcodeText(sample.raw)}</p></li>)}</ul>
      </Card>
      {diagnostics ? <Card className="space-y-1 p-4 text-xs text-[#58747d]"><details open><summary className="cursor-pointer text-sm font-semibold text-[#315763]">DataMatrix diagnostics (camera scan)</summary>
        <p>Format: <span className="mono">{barcodeFormatName(diagnostics.barcodeFormat) ?? 'n/a'}</span> · Symbology: <span className="mono">{diagnostics.symbologyId ?? 'none'}</span></p>
        <p>Decoded: <span className="mono break-all">{diagnostics.rawEscaped}</span></p>
        <p>Raw bytes: <span className="mono break-all">{diagnostics.rawBytesHex ?? 'n/a'}</span></p>
        <p>Normalized GS1: <span className="mono break-all">{diagnostics.normalizedPayload ?? 'n/a'}</span></p>
        <p>GTIN {diagnostics.parsed.gtin ?? '—'} · Lot {diagnostics.parsed.lot ?? '—'} · Exp {diagnostics.parsed.expiry ?? '—'} · Mfg {diagnostics.parsed.manufactureDate ?? '—'} · AI240 {diagnostics.parsed.additionalProductId ?? '—'} · Serial {diagnostics.parsed.serial ?? '—'}</p>
        <p>Parser error: {diagnostics.parserError ?? 'none'}</p>
      </details></Card> : null}
      {receipts.length ? <Card className="space-y-2 p-4"><p className="text-sm font-bold text-[#173d50]">ใบรับเข้าที่จำลองการยืนยัน</p>{receipts.map((receipt) => { const assessment = assessments.find((item) => item.receiptId === receipt.id); return <div key={receipt.id} className="rounded-md border border-[#dce8e9] p-2 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-[#315763]">{receipt.receiptNo} · {receipt.lines.length} รายการ</span><StatusBadge tone={assessment?.status === 'completed' ? 'accepted' : 'warning'} label={assessment?.status === 'completed' ? 'ประเมินแล้ว' : 'รอประเมิน'} /></div>{receipt.lines.map((line) => <p key={line.id} className="mt-1 text-[#58747d]">Lot {line.lotNumber ?? '—'} · Exp {line.expiryDate ?? '—'} · Qty {line.receivedQty}{line.barcodeGtin ? ` · GTIN ${line.barcodeGtin}` : ''}{line.barcodeAdditionalProductId ? ` · AI240 ${line.barcodeAdditionalProductId}` : ''}</p>)}{evidenceLog[receipt.id] ? <p className="mt-1 text-[#2f7d44]">แนบรูปใบส่งของเป็นหลักฐาน (จำลอง)</p> : null}</div> })}</Card> : null}
    </div> : null}

    {tab === 'vendors' ? <Card className="overflow-x-auto p-0"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-[#f1f6f6] text-[#58747d]"><tr><th className="p-2">Code</th><th className="p-2">ชื่อ</th><th className="p-2">Tax ID</th><th className="p-2">ติดต่อ</th><th className="p-2">โทร / Email</th><th className="p-2">สถานะ</th><th className="p-2">หมายเหตุ</th></tr></thead><tbody>{PREVIEW_VENDORS.map((vendor) => <tr key={vendor.id} className="border-t border-[#edf2f2]"><td className="mono p-2">{vendor.code}</td><td className="p-2 font-semibold text-[#173d50]">{vendor.name}<br /><span className="font-normal text-[#81979c]">{vendor.address ?? ''}</span></td><td className="mono p-2">{vendor.taxId ?? '-'}</td><td className="p-2">{vendor.contactPerson ?? '-'}</td><td className="p-2">{[vendor.phone, vendor.email].filter(Boolean).join(' · ') || '-'}</td><td className="p-2"><StatusBadge tone={vendor.isActive ? 'accepted' : 'neutral'} label={vendor.isActive ? 'active' : 'inactive'} /></td><td className="p-2">{vendor.note ?? '-'}</td></tr>)}</tbody></table><p className="p-3 text-xs text-[#81979c]">Production ใช้ Vendor Registry เดิม (bm_vendors) ที่ /admin — ข้อมูลในหน้านี้เป็น fixture</p></Card> : null}

    {tab === 'performance' ? <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-2 p-4"><div><p className="text-sm font-bold text-[#173d50]">Vendor Performance · ปีงบประมาณ {vendorFiscalYearLabel(fiscalYear)}</p><p className="text-xs text-[#81979c]">1 ต.ค. – 30 ก.ย. · คำนวณจากใบรับเข้าและการประเมินที่จำลองในหน้านี้ · ไม่มีคะแนน</p></div><select className="min-h-11 rounded-md border border-[#cfdee0] px-3 text-sm" value={performanceVendorId} onChange={(event) => setPerformanceVendorId(event.target.value)}>{PREVIEW_VENDORS.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code}</option>)}</select></Card>
      <VendorMetricsPanel metrics={vendorMetrics} receiptHref={null} receiptLabel={receiptLabel} />
    </div> : null}

    {tab === 'evaluation' ? <div className="space-y-3">
      <Card className="space-y-2 p-4"><p className="text-sm font-bold text-[#173d50]">Annual Vendor Evaluation · {vendorFiscalYearLabel(fiscalYear)}</p><p className="text-xs text-[#81979c]">สร้าง snapshot ของ metrics (พร้อมที่มา) ตามระบบจริง — ไม่มีคะแนน น้ำหนัก เกณฑ์ผ่าน/ไม่ผ่าน หรือการจัดอันดับ</p><Button type="button" onClick={() => setSnapshot({ vendorId: performanceVendorId, metrics: vendorMetrics, frozenAt: new Date().toISOString() })}>Freeze snapshot ({PREVIEW_VENDORS.find((vendor) => vendor.id === performanceVendorId)?.code})</Button></Card>
      <Notice tone="warning">ยังไม่ได้กำหนดสูตรคะแนน — รออนุมัติ P-13/P-14 · result = null</Notice>
      {snapshot ? <><p className="text-xs text-[#81979c]">Snapshot frozen {snapshot.frozenAt} · ไม่เปลี่ยนตามการรับสินค้าภายหลัง</p><VendorMetricsPanel metrics={snapshot.metrics} receiptHref={null} receiptLabel={receiptLabel} /></> : <p className="text-sm text-[#81979c]">ยังไม่ได้ freeze snapshot</p>}
    </div> : null}

    <Card className="border-[#e7d6b0] bg-[#fffaf0] p-4 text-sm text-[#76551c]"><p className="font-semibold">Safety boundary</p><p className="mt-1">Route นี้เปิดเฉพาะ Vercel Preview ที่ตั้ง <code>STOCK1_PREVIEW_ACCEPTANCE_MODE=true</code> และเป็น 404 ใน Production ไม่มีการสร้าง invoice, receipt, lot, transaction หรือ attachment จริง</p></Card>

    {dialog ? <ReceiptAssessmentDialog key={dialog.receiptId} context={dialog} onSubmit={(answers) => saveAssessment(dialog.receiptId, answers)} onDismiss={() => { setDialog(null); setNotice('ปิดหน้าต่างประเมิน — การรับยังคงอยู่ และการประเมินอยู่ในสถานะ Pending') }} /> : null}
  </main>

  function contextFor(receipt: Receipt): ReceiptAssessmentContext {
    const vendor = PREVIEW_VENDORS.find((item) => item.id === receipt.vendorId)
    const upTo = receipts.slice(0, receipts.indexOf(receipt) + 1).flatMap((candidate) => candidate.lines)
    return {
      receiptId: receipt.id,
      receiptLabel: receipt.receiptNo ?? receipt.id,
      vendorLabel: vendor ? `${vendor.code} · ${vendor.name}` : receipt.vendorId,
      receivedDate: receipt.receivedDate,
      quantity: receiptQuantitySummary(receipt.lines.map((line) => ({ lineNo: line.lineNo, itemLabel: PREVIEW_ITEMS.find((item) => item.id === line.stockItemId)?.name ?? line.stockItemId, unit: PREVIEW_ITEMS.find((item) => item.id === line.stockItemId)?.unit ?? '', receivedQty: line.receivedQty, expectedQty: line.expectedQty, cumulativeReceivedQty: line.invoiceLineId ? upTo.filter((candidate) => candidate.invoiceLineId === line.invoiceLineId).reduce((sum, candidate) => sum + candidate.receivedQty, 0) : null }))),
    }
  }
}
