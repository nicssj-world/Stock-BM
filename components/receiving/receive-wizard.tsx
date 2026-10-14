'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ClipboardCheck, FileText, PackagePlus, ScanLine, Trash2, X } from 'lucide-react'
import { remainingShelfLife, torExpiryCompliance } from '@/lib/bm/shelf-life'
import { todayBangkok } from '@/lib/bm/rules'
import type { ReceiptLineInput } from '@/lib/receiving/api-schemas'
import { receiptQuantitySummary } from '@/lib/receiving/assessment'
import { cumulativeReceived } from '@/lib/receiving/rules'
import type { AcceptanceReasonCode, ReceiptDecision, ReceivingWorkspace, TorCompliance } from '@/lib/receiving/types'
import { Button, Card, Field, Input, Notice, Select, StatusBadge } from '@/components/ui'
import { ExpiryException } from '@/components/receiving/expiry-exception'
import { InvoiceImageCrop, type InvoiceEvidenceImage } from '@/components/receiving/invoice-image-crop'
import { ItemPicker } from '@/components/receiving/item-picker'
import { PackageScan, type PackageScanResolver, type PackageScanResponse } from '@/components/receiving/package-scan'
import type { ReceiptAssessmentContext } from '@/components/receiving/receipt-assessment-dialog'
import { ScanTextField } from '@/components/receiving/scan-text-field'
import type { BarcodeScanDiagnostics } from '@/lib/receiving/barcode-diagnostics'

type ScanEvidence = {
  raw: string
  symbologyId: string | null
  standard: string | null
  gtin: string | null
  lot: string | null
  expiry: string | null
  manufactureDate: string | null
  bestBeforeDate: string | null
  serial: string | null
  additionalProductId: string | null
  matchedItemId: string | null
}

export type ReceiveLineDraft = {
  key: string
  itemId: string
  invoiceLineId: string | null
  expectedQty: number | null
  locationId: string
  lotNumber: string
  expiryDate: string
  receivedQty: number
  scan: ScanEvidence | null
  compliance: TorCompliance
  remainingShelfLifeDays: number | null
  receiptDecision: ReceiptDecision
  acceptanceReasonCode: AcceptanceReasonCode | null
  acceptanceReasonNote: string | null
}

export type ReceiveSubmission = {
  vendorId: string
  invoiceId: string | null
  receiptNo: string | null
  receivedDate: string
  lines: ReceiptLineInput[]
  evidence: InvoiceEvidenceImage | null
}

/**
 * Production posts to the existing draft → evidence → confirm_bm_receipt
 * path; Preview supplies an in-browser simulation. The wizard itself never
 * calls an API and never mutates stock.
 */
export type ReceiveAdapter = {
  resolveScan?: PackageScanResolver
  /** Preview-only scan diagnostics (raw bytes, normalized GS1, parser errors). */
  onScanDiagnostics?: (diagnostics: BarcodeScanDiagnostics) => void
  submit: (submission: ReceiveSubmission) => Promise<{ receiptId: string; receiptLabel?: string }>
}

/** Thrown by an adapter when a draft was saved but not confirmed, so the form must not re-submit it. */
export class ReceiveDraftSavedError extends Error {
  readonly draftSaved = true
}

type EditorState = {
  itemId: string | null
  invoiceLineId: string
  locationId: string
  lotNumber: string
  expiryDate: string
  receivedQty: string
  scan: ScanEvidence | null
  receiptDecision: ReceiptDecision
  acceptanceReasonCode: AcceptanceReasonCode | null
  acceptanceReasonNote: string | null
}

const blankEditor = (locationId: string): EditorState => ({
  itemId: null,
  invoiceLineId: '',
  locationId,
  lotNumber: '',
  expiryDate: '',
  receivedQty: '',
  scan: null,
  receiptDecision: 'accepted',
  acceptanceReasonCode: null,
  acceptanceReasonNote: null,
})

export function ReceiveWizard({ data, adapter, onReceived, onError }: {
  data: ReceivingWorkspace
  adapter: ReceiveAdapter
  onReceived: (result: { receiptId: string; assessment: ReceiptAssessmentContext }) => void
  onError?: (message: string) => void
}) {
  const activeVendors = data.vendors.filter((vendor) => vendor.isActive)
  const activeLocations = data.locations.filter((location) => location.isActive)
  const defaultLocation = activeLocations[0]?.id ?? ''
  const [vendorId, setVendorId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [receiptNo, setReceiptNo] = useState('')
  const [invoiceBarcode, setInvoiceBarcode] = useState('')
  const [invoiceScanNotice, setInvoiceScanNotice] = useState<string | null>(null)
  const [lineDialogOpen, setLineDialogOpen] = useState(false)
  const [scanResetKey, setScanResetKey] = useState(0)
  const lineDialogRef = useRef<HTMLDivElement | null>(null)
  const [evidence, setEvidence] = useState<InvoiceEvidenceImage | null>(null)
  const [editor, setEditor] = useState<EditorState>(() => blankEditor(defaultLocation))
  const [lines, setLines] = useState<ReceiveLineDraft[]>([])
  const [stage, setStage] = useState<'edit' | 'review'>('edit')
  const [lineError, setLineError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lineKeySeed = useRef(0)
  const receivedDate = todayBangkok()

  useEffect(() => {
    if (!lineDialogOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    lineDialogRef.current?.focus()
    function handleDialogKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setLineDialogOpen(false) }
      if (event.key !== 'Tab' || !lineDialogRef.current) return
      const focusable = Array.from(lineDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'))
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === lineDialogRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleDialogKey)
    return () => { document.body.style.overflow = oldOverflow; window.removeEventListener('keydown', handleDialogKey); previousFocus?.focus() }
  }, [lineDialogOpen])

  const openInvoices = useMemo(() => data.invoices.filter((invoice) => invoice.status === 'open' && invoice.vendorId === vendorId), [data.invoices, vendorId])
  const selectedInvoice = data.invoices.find((invoice) => invoice.id === invoiceId) ?? null
  const selectedItem = data.items.find((item) => item.id === editor.itemId) ?? null
  const vendor = data.vendors.find((item) => item.id === vendorId) ?? null
  // True only right after a scan auto-selected this exact item — drives the
  // "auto-selected from scan" status line, not an interactive confirmation.
  const itemAutoSelectedFromScan = Boolean(editor.scan?.matchedItemId && editor.scan.matchedItemId === editor.itemId)
  const confirmedLines = useMemo(() => data.receipts.filter((receipt) => receipt.status === 'confirmed').flatMap((receipt) => receipt.lines), [data.receipts])

  const liveCompliance = torExpiryCompliance(editor.expiryDate || null, receivedDate)
  const lotMismatch = Boolean(editor.scan?.lot && editor.lotNumber.trim() !== editor.scan.lot)
  const expiryMismatch = Boolean(editor.scan?.expiry && editor.expiryDate !== editor.scan.expiry)
  const itemMismatch = Boolean(editor.scan?.matchedItemId && editor.itemId && editor.scan.matchedItemId !== editor.itemId)

  function patchEditor(next: Partial<EditorState>) {
    setEditor((current) => ({ ...current, ...next }))
    setLineError(null)
  }

  function chooseVendor(next: string) {
    setVendorId(next)
    setInvoiceId('')
    setLines((current) => current.map((line) => ({ ...line, invoiceLineId: null, expectedQty: null })))
    patchEditor({ invoiceLineId: '' })
  }

  function resolveInvoiceBarcode(barcode: string) {
    const normalized = barcode.trim().toLocaleUpperCase('en-US')
    if (!normalized) { setInvoiceScanNotice(null); return }
    const matches = data.invoices.filter((invoice) => invoice.status === 'open' && invoice.invoiceNo?.trim().toLocaleUpperCase('en-US') === normalized && (!vendorId || invoice.vendorId === vendorId))
    if (matches.length === 1) {
      const invoice = matches[0]
      if (invoice.vendorId !== vendorId) setVendorId(invoice.vendorId)
      setInvoiceId(invoice.id)
      patchEditor({ invoiceLineId: '' })
      setInvoiceScanNotice(`พบ Invoice ${invoice.invoiceNo} — เลือกใบส่งของให้แล้ว`)
    } else if (matches.length > 1) {
      setInvoiceScanNotice('เลข Invoice ตรงกับหลายรายการ กรุณาเลือก Vendor และใบส่งของด้วยตนเอง')
    } else {
      setInvoiceScanNotice('อ่านเลขบาร์โค้ดได้แล้ว แต่ไม่พบ Invoice ที่เปิดอยู่ในระบบ — ตรวจสอบ Vendor หรือรับเข้าแบบไม่ผูกใบส่งของ')
    }
  }

  function chooseInvoiceLine(lineId: string) {
    const invoiceLine = selectedInvoice?.lines.find((line) => line.id === lineId)
    patchEditor({ invoiceLineId: lineId, ...(invoiceLine?.stockItemId ? { itemId: invoiceLine.stockItemId } : {}) })
  }

  function applyScan(result: PackageScanResponse) {
    const parsed = result.parsed
    const scan: ScanEvidence = {
      raw: parsed.raw,
      symbologyId: parsed.symbologyId,
      standard: parsed.standard,
      gtin: parsed.gtin,
      lot: parsed.lot,
      expiry: parsed.expiry,
      manufactureDate: parsed.manufactureDate,
      bestBeforeDate: parsed.bestBeforeDate,
      serial: parsed.serial,
      additionalProductId: parsed.additionalProductId,
      matchedItemId: result.itemId,
    }
    // An exact, unique, already-registered GTIN↔Item mapping resolves the
    // item straight from the scan. This is still never a guess: ambiguous or
    // unmatched GTINs are excluded before onUse ever fires (see PackageScan),
    // and GTIN/AI 240 are still never written into Catalog/REF — only an
    // existing Item Master id.
    const scannedItemId = result.itemId
    // A package scan identifies the item and prefills lot/expiry, but does
    // not establish the quantity in stock units. The operator must enter
    // the actual received quantity and explicitly add the receiving line.
    // Keep the existing item/invoice mismatch and TOR checks in addLine().
    patchEditor({
      scan,
      ...(parsed.lot ? { lotNumber: parsed.lot } : {}),
      ...(parsed.expiry ? { expiryDate: parsed.expiry } : {}),
      ...(scannedItemId && !editor.itemId ? { itemId: scannedItemId } : {}),
    })
    setLineDialogOpen(true)
  }

  function addLine() {
    const qty = Number(editor.receivedQty)
    if (!editor.itemId || !selectedItem) return setLineError('กรุณาเลือก Item / Catalog-REF จาก Item Master')
    if (!editor.locationId) return setLineError('กรุณาเลือก location')
    if (selectedItem.trackLot && !editor.lotNumber.trim()) return setLineError('กรุณาระบุ Lot')
    if (selectedItem.trackExpiry && !editor.expiryDate) return setLineError('กรุณาระบุวันหมดอายุ')
    if (!editor.receivedQty.trim() || !Number.isFinite(qty) || qty <= 0) return setLineError('กรุณาระบุจำนวนที่ได้รับจริง (มากกว่า 0)')
    if (itemMismatch) return setLineError('GTIN ของ package ผูกกับ Item อื่น — ตรวจสอบ Item หรือสแกนใหม่')
    if (lotMismatch || expiryMismatch) return setLineError('Lot/Expiry ไม่ตรงกับ barcode — แก้ให้ตรง หรือกด “ล้างข้อมูล barcode”')
    if (selectedInvoice && !editor.invoiceLineId) return setLineError('กรุณาเลือกรายการในใบส่งของ หรือเลือก “ไม่ผูกใบส่งของ”')
    if (liveCompliance === 'not_compliant') {
      if (!data.policy.expiryExceptionEnabled) return setLineError('ยังไม่เปิดใช้งานการรับสินค้าที่ไม่ผ่านเกณฑ์ TOR — รออนุมัติผู้มีสิทธิ์ (P-01/P-02)')
      if (editor.receiptDecision !== 'accepted_with_justification' || !editor.acceptanceReasonCode || (editor.acceptanceReasonCode === 'other' && !editor.acceptanceReasonNote?.trim())) {
        return setLineError('กรุณาระบุเหตุผลการยอมรับสินค้าที่ไม่ผ่านเกณฑ์ TOR ให้ครบ')
      }
    }
    const invoiceLine = selectedInvoice?.lines.find((line) => line.id === editor.invoiceLineId) ?? null
    lineKeySeed.current += 1
    setLines((current) => [...current, {
      key: `line-${lineKeySeed.current}`,
      itemId: editor.itemId!,
      invoiceLineId: invoiceLine?.id ?? null,
      expectedQty: invoiceLine?.expectedQty ?? null,
      locationId: editor.locationId,
      lotNumber: selectedItem.trackLot ? editor.lotNumber.trim() : '',
      expiryDate: selectedItem.trackExpiry ? editor.expiryDate : '',
      receivedQty: qty,
      scan: editor.scan,
      compliance: liveCompliance,
      remainingShelfLifeDays: remainingShelfLife(editor.expiryDate || null, receivedDate),
      receiptDecision: liveCompliance === 'not_compliant' ? 'accepted_with_justification' : 'accepted',
      acceptanceReasonCode: liveCompliance === 'not_compliant' ? editor.acceptanceReasonCode : null,
      acceptanceReasonNote: liveCompliance === 'not_compliant' ? editor.acceptanceReasonNote : null,
    }])
    setEditor(blankEditor(editor.locationId))
    setLineDialogOpen(false)
    setScanResetKey((current) => current + 1)
  }

  function itemName(itemId: string) {
    const item = data.items.find((candidate) => candidate.id === itemId)
    return item ? `${item.catalogNo ? `REF ${item.catalogNo} · ` : ''}${item.name}` : itemId
  }

  function toSubmissionLines(): ReceiptLineInput[] {
    return lines.map((line, index) => {
      const item = data.items.find((candidate) => candidate.id === line.itemId)
      return {
        lineNo: index + 1,
        invoiceLineId: line.invoiceLineId,
        stockItemId: line.itemId,
        locationId: line.locationId,
        lotNumber: line.lotNumber || null,
        expiryDate: line.expiryDate || null,
        lotMode: item?.trackLot ? 'new' : 'not_tracked',
        expectedQty: line.expectedQty,
        receivedQty: line.receivedQty,
        barcodeRaw: line.scan?.raw ?? null,
        barcodeSymbology: line.scan?.symbologyId ?? null,
        barcodeStandard: line.scan?.standard ?? null,
        barcodeGtin: line.scan?.gtin ?? null,
        barcodeLot: line.scan?.lot ?? null,
        barcodeExpiry: line.scan?.expiry ?? null,
        barcodeAdditionalProductId: line.scan?.additionalProductId ?? null,
        barcodeManufactureDate: line.scan?.manufactureDate ?? null,
        barcodeBestBefore: line.scan?.bestBeforeDate ?? null,
        barcodeSerial: line.scan?.serial ?? null,
        conflicts: [],
        torExpiryCompliance: line.compliance,
        remainingShelfLifeDays: line.remainingShelfLifeDays,
        receiptDecision: line.receiptDecision,
        acceptanceReasonCode: line.acceptanceReasonCode,
        acceptanceReasonNote: line.acceptanceReasonNote,
        sortOrder: index + 1,
      }
    })
  }

  function assessmentContext(receiptId: string, receiptLabel: string): ReceiptAssessmentContext {
    return {
      receiptId,
      receiptLabel,
      vendorLabel: vendor ? `${vendor.code} · ${vendor.name}` : vendorId,
      receivedDate,
      quantity: receiptQuantitySummary(lines.map((line, index) => {
        const item = data.items.find((candidate) => candidate.id === line.itemId)
        const previous = line.invoiceLineId ? cumulativeReceived(confirmedLines.filter((candidate) => candidate.invoiceLineId === line.invoiceLineId)) : null
        const sameReceipt = line.invoiceLineId ? cumulativeReceived(lines.filter((candidate) => candidate.invoiceLineId === line.invoiceLineId)) : null
        return {
          lineNo: index + 1,
          itemLabel: itemName(line.itemId),
          unit: item?.unit ?? '',
          receivedQty: line.receivedQty,
          expectedQty: line.expectedQty,
          cumulativeReceivedQty: previous == null || sameReceipt == null ? null : previous + sameReceipt,
        }
      })),
    }
  }

  async function confirmReceipt() {
    if (!vendorId || !lines.length || busy) return
    setBusy(true)
    setSubmitError(null)
    try {
      const submission: ReceiveSubmission = { vendorId, invoiceId: invoiceId || null, receiptNo: receiptNo.trim() || null, receivedDate, lines: toSubmissionLines(), evidence }
      const result = await adapter.submit(submission)
      const context = assessmentContext(result.receiptId, result.receiptLabel ?? (receiptNo.trim() || result.receiptId.slice(0, 8)))
      setLines([])
      setEvidence(null)
      setReceiptNo('')
      setInvoiceBarcode('')
      setInvoiceScanNotice(null)
      setInvoiceId('')
      setStage('edit')
      setEditor(blankEditor(editor.locationId))
      onReceived({ receiptId: result.receiptId, assessment: context })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ยืนยันรับสินค้าไม่สำเร็จ'
      if (error instanceof ReceiveDraftSavedError) {
        // The draft now lives in the drafts list; clearing avoids a duplicate draft on retry.
        setLines([])
        setEvidence(null)
        setStage('edit')
      }
      setSubmitError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  const stepTitle = (step: number, title: string, done: boolean) => <p className="flex items-center gap-2 text-sm font-bold text-[#173d50]"><span className={`grid size-6 place-items-center rounded-full text-xs ${done ? 'bg-[#0b7f76] text-white' : 'bg-[#e4eff0] text-[#315763]'}`}>{step}</span>{title}</p>

  if (stage === 'review') {
    return <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold tracking-[0.14em] text-[#0b7f76] uppercase">ตรวจสอบก่อนยืนยัน</p><h2 className="mt-1 text-lg font-bold text-[#173d50]">Review receipt</h2></div><StatusBadge tone="warning" label="ยังไม่บันทึก stock" /></div>
      <dl className="grid gap-2 rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-[#81979c]">Vendor</dt><dd className="font-semibold text-[#173d50]">{vendor ? `${vendor.code} · ${vendor.name}` : '-'}</dd></div>
        <div><dt className="text-xs text-[#81979c]">ใบส่งของ (Expected)</dt><dd className="font-semibold text-[#173d50]">{selectedInvoice ? selectedInvoice.invoiceNo ?? selectedInvoice.id.slice(0, 8) : 'ไม่ผูก'}</dd></div>
        <div><dt className="text-xs text-[#81979c]">วันที่รับ</dt><dd className="font-semibold text-[#173d50]">{receivedDate}</dd></div>
        <div><dt className="text-xs text-[#81979c]">หลักฐานใบส่งของ</dt><dd className="font-semibold text-[#173d50]">{evidence ? `แนบรูป (${evidence.skipped ? 'ภาพเต็ม' : 'crop แล้ว'})` : 'ไม่มีรูป'}</dd></div>
      </dl>
      <ul className="space-y-2">{lines.map((line, index) => {
        const item = data.items.find((candidate) => candidate.id === line.itemId)
        return <li key={line.key} className="rounded-md border border-[#dce8e9] p-3 text-sm"><p className="font-semibold text-[#173d50]">#{index + 1} {itemName(line.itemId)}</p><p className="mt-1 text-xs text-[#58747d]">Lot <span className="mono">{line.lotNumber || '—'}</span> · Exp <span className="mono">{line.expiryDate || '—'}</span> · รับจริง <b>{line.receivedQty} {item?.unit ?? ''}</b>{line.expectedQty != null ? ` · expected ${line.expectedQty}` : ''}{line.scan ? ' · จาก barcode' : ''}</p></li>
      })}</ul>
      {submitError ? <Notice tone="danger">{submitError}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setStage('edit')}><ArrowLeft className="size-4" />กลับไปแก้ไข</Button>
        <Button type="button" disabled={busy || !lines.length || !vendorId} onClick={() => void confirmReceipt()}><ClipboardCheck className="size-4" />{busy ? 'กำลังบันทึก…' : 'ยืนยันรับสินค้า'}</Button>
      </div>
      <p className="text-xs text-[#81979c]">ระบบจะตรวจ lot, expiry, TOR และ feature flag ซ้ำในฐานข้อมูลก่อนเขียนผ่าน ledger เดิม</p>
    </Card>
  }

  return <div className="space-y-4">
    <Card className="space-y-3 p-4">
      {stepTitle(1, 'เลือก Vendor', Boolean(vendorId))}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vendor"><Select required value={vendorId} onChange={(event) => chooseVendor(event.target.value)}><option value="">เลือก vendor จาก Vendor Registry</option>{activeVendors.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</Select></Field>
        <ScanTextField label="เลขที่ใบรับเข้า" hint="ไม่บังคับ — พิมพ์หรือสแกนบาร์โค้ด/QR บนเอกสารได้" value={receiptNo} onChange={setReceiptNo} disabled={busy} scanLabel="สแกนเลขที่ใบรับเข้าด้วยกล้อง" />
        <div className="sm:col-span-2 space-y-2">
          <ScanTextField label="สแกนเลข Invoice / ใบส่งของ (Barcode)" hint="รองรับบาร์โค้ด 1 มิติ เช่น Code 128, Code 39, ITF และการพิมพ์เลขเอง" value={invoiceBarcode} onChange={(code) => { setInvoiceBarcode(code); setInvoiceScanNotice(null) }} onScanned={resolveInvoiceBarcode} disabled={busy} scanLabel="สแกนบาร์โค้ด Invoice ด้วยกล้อง" />
          <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" disabled={!invoiceBarcode.trim()} onClick={() => resolveInvoiceBarcode(invoiceBarcode)}>ค้นหา Invoice</Button>
          {invoiceScanNotice ? <p className="text-xs text-[#315763]" role="status">{invoiceScanNotice}</p> : null}</div>
        </div>
        {vendorId && openInvoices.length ? <Field label="ใบส่งของที่รอรับ (Expected receipt)" hint="ไม่บังคับ — ใช้ติดตามรับบางส่วน"><Select value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); patchEditor({ invoiceLineId: '' }) }}><option value="">ไม่ผูกใบส่งของ</option>{openInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo ?? invoice.id.slice(0, 8)} · {invoice.lines.length} รายการ</option>)}</Select></Field> : null}
      </div>
    </Card>

    <div>{stepTitle(2, 'รูปใบส่งของ (หลักฐาน)', Boolean(evidence))}<div className="mt-2"><InvoiceImageCrop value={evidence} onChange={setEvidence} disabled={busy} /></div></div>

    <Card className="space-y-4 p-4">
      {stepTitle(3, 'เพิ่มรายการรับ: Scan → Item/Lot/Expiry → จำนวน', lines.length > 0)}
      <PackageScan key={scanResetKey} selectedItemId={editor.itemId} disabled={busy} onUse={applyScan} resolveScan={adapter.resolveScan} onScanDiagnostics={adapter.onScanDiagnostics} />
      <p className="text-xs text-[#58747d]">สแกนเพื่อเติม Item / Lot / Expiry จากนั้นระบุจำนวนที่ได้รับจริงและกดเพิ่มรายการนี้ (สแกนซ้ำไม่เพิ่มจำนวนอัตโนมัติ)</p>
      {editor.scan ? <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#58747d]"><span className="flex items-center gap-1"><ScanLine className="size-4" />ใช้ข้อมูลจาก barcode {editor.scan.standard?.toUpperCase()}{itemAutoSelectedFromScan ? ' · เลือก Item ให้อัตโนมัติจาก GTIN ที่ตรงกันแบบไม่กำกวม — ตรวจสอบก่อนเพิ่มรายการ' : ''}</span><button type="button" className="min-h-11 px-2 font-semibold text-[#0b7f76] underline" onClick={() => patchEditor({ scan: null })}>ล้างข้อมูล barcode</button></div> : null}
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setLineDialogOpen(true)}><PackagePlus className="size-4" />เพิ่มรายการด้วยตนเอง / กรอกจำนวน</Button>
      {editor.scan ? <p className="text-xs text-[#58747d]">ข้อมูลสแกนถูกเก็บไว้ในแบบร่าง กดกรอกจำนวนเพื่อดำเนินการต่อ</p> : null}
      {lineDialogOpen ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0d2430]/60 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLineDialogOpen(false) }}>
        <div ref={lineDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="เพิ่มรายการรับสินค้า" className="flex max-h-[96dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-[#e1eaeb] px-4 py-3">
            <div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#0b7f76]">Receiving</p><h3 className="text-lg font-bold text-[#173d50]">ตรวจข้อมูลและกรอกจำนวนรับ</h3><p className="text-xs text-[#58747d]">{editor.scan ? 'อ่าน Barcode แล้ว — ตรวจ Item / Lot / Expiry ก่อนเพิ่ม' : 'เพิ่มสินค้าด้วยตนเอง'}</p></div>
            <button type="button" aria-label="ปิดหน้าต่าง" className="grid size-11 shrink-0 place-items-center rounded-md text-[#58747d] hover:bg-[#eef5f4]" onClick={() => setLineDialogOpen(false)}><X className="size-5" /></button>
          </div>
          <div className="space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
            {editor.scan ? <div className="rounded-md border border-[#cfe1e2] bg-[#f4fbf9] px-3 py-2 text-xs text-[#315763]"><p className="font-semibold">ข้อมูลจาก Barcode</p><p>GTIN {editor.scan.gtin ?? '—'} · AI 240 {editor.scan.additionalProductId ?? '—'}</p><p>Lot {editor.scan.lot ?? '—'} · Expiry {editor.scan.expiry ?? '—'}</p></div> : null}
      <div className="space-y-1"><p className="text-xs font-semibold text-[#58747d]">Item / Catalog-REF <span className="text-[#c23745]">*</span></p>
        <ItemPicker items={data.items} value={editor.itemId} onChange={(itemId) => patchEditor({ itemId })} disabled={busy} initialQuery={editor.scan?.additionalProductId ?? ''} />
      </div>
      {selectedInvoice ? <Field label="รายการในใบส่งของ"><Select value={editor.invoiceLineId} onChange={(event) => chooseInvoiceLine(event.target.value)}><option value="">เลือกรายการ</option>{selectedInvoice.lines.filter((line) => line.closureState !== 'cancelled').map((line) => <option key={line.id} value={line.id}>#{line.lineNo} · {line.catalogNoText ?? line.descriptionText ?? 'ไม่มีรายละเอียด'} · expected {line.expectedQty}</option>)}</Select></Field> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={`Lot${selectedItem && !selectedItem.trackLot ? ' (ไม่ติดตาม)' : ''}`}><Input value={editor.lotNumber} onChange={(event) => patchEditor({ lotNumber: event.target.value })} disabled={busy || Boolean(selectedItem && !selectedItem.trackLot)} className={`mono ${lotMismatch ? 'border-[#d9534f]' : ''}`} autoCapitalize="characters" /></Field>
        <Field label={`วันหมดอายุ${selectedItem && !selectedItem.trackExpiry ? ' (ไม่ติดตาม)' : ''}`}><Input type="date" value={editor.expiryDate} onChange={(event) => patchEditor({ expiryDate: event.target.value })} disabled={busy || Boolean(selectedItem && !selectedItem.trackExpiry)} className={expiryMismatch ? 'border-[#d9534f]' : ''} /></Field>
        <Field label={`จำนวนที่ได้รับจริง *${selectedItem ? ` (${selectedItem.unit})` : ''}`}><Input type="number" inputMode="decimal" min="0.001" step="0.001" value={editor.receivedQty} onChange={(event) => patchEditor({ receivedQty: event.target.value })} disabled={busy} required /></Field>
      </div>
      {lotMismatch || expiryMismatch ? <p className="text-xs font-semibold text-[#a83541]">Lot/Expiry ที่แก้ไม่ตรงกับ barcode</p> : null}
      <Field label="Location"><Select value={editor.locationId} onChange={(event) => patchEditor({ locationId: event.target.value })}><option value="">เลือก location</option>{activeLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</Select></Field>
      {editor.expiryDate ? <p className="text-xs"><StatusBadge tone={liveCompliance === 'compliant' ? 'accepted' : liveCompliance === 'not_compliant' ? 'warning' : 'neutral'} label={liveCompliance === 'compliant' ? '✓ ผ่านเกณฑ์ TOR (> 6 เดือน)' : liveCompliance === 'not_compliant' ? '⚠ ไม่ผ่าน TOR' : 'ไม่ประเมิน TOR'} /></p> : null}
      {liveCompliance === 'not_compliant' && editor.expiryDate ? <ExpiryException lineId="new-line" expiry={editor.expiryDate} received={receivedDate} enabled={data.policy.expiryExceptionEnabled} decision={editor.receiptDecision} reasonCode={editor.acceptanceReasonCode} reasonNote={editor.acceptanceReasonNote} onDecisionChange={(value) => patchEditor({ receiptDecision: value })} onReasonChange={(value) => patchEditor({ acceptanceReasonCode: value, receiptDecision: 'accepted_with_justification' })} onReasonNoteChange={(value) => patchEditor({ acceptanceReasonNote: value })} /> : null}
      {lineError ? <Notice tone="danger">{lineError}</Notice> : null}

          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
            <Button type="button" variant="ghost" onClick={() => setLineDialogOpen(false)}>ยกเลิก</Button>
            <Button type="button" disabled={busy} onClick={addLine}><PackagePlus className="size-4" />เพิ่มรายการนี้</Button>
          </div>
        </div>
      </div>}
    </Card>

    <Card className="space-y-3 p-4">
      {stepTitle(4, `รายการที่จะรับ (${lines.length})`, lines.length > 0)}
      {lines.length ? <ul className="space-y-2">{lines.map((line, index) => <li key={line.key} className="flex items-start justify-between gap-2 rounded-md border border-[#dce8e9] p-3 text-sm"><div className="min-w-0"><p className="font-semibold text-[#173d50]">#{index + 1} {itemName(line.itemId)}</p><p className="text-xs text-[#58747d]">Lot <span className="mono">{line.lotNumber || '—'}</span> · Exp <span className="mono">{line.expiryDate || '—'}</span> · รับจริง <b>{line.receivedQty}</b>{line.expectedQty != null ? ` / expected ${line.expectedQty}` : ''}</p></div><Button type="button" variant="ghost" aria-label={`ลบรายการ ${index + 1}`} disabled={busy} onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}><Trash2 className="size-4" /></Button></li>)}</ul> : <p className="text-sm text-[#81979c]">ยังไม่มีรายการ — เพิ่มจากขั้นตอนที่ 3</p>}
      {submitError ? <Notice tone="danger">{submitError}</Notice> : null}
      {!vendorId && lines.length ? <Notice tone="warning">กรุณาเลือก Vendor ก่อนตรวจสอบ</Notice> : null}
      <Button type="button" disabled={busy || !vendorId || !lines.length} onClick={() => setStage('review')}><FileText className="size-4" />ตรวจสอบก่อนยืนยัน</Button>
    </Card>
  </div>
}
