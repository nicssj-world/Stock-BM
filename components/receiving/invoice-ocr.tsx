'use client'

import { useState } from 'react'
import { CheckCircle2, FileScan, LoaderCircle, RefreshCcw, Square } from 'lucide-react'
import type { ReceivingWorkspace } from '@/lib/receiving/types'
import { buildInvoiceOcrDraftLines, type InvoiceOcrDraftLine } from '@/lib/receiving/invoice-ocr-draft'
import { recognizeProcessedInvoiceImage, type OcrProgress } from '@/components/receiving/ocr-worker'
import { api, Button, Card, Field, Input, Loading, Notice, Select, StatusBadge, Textarea } from '@/components/ui'

type OcrItem = ReceivingWorkspace['items'][number]

export function InvoiceOcr({ processedImage, vendorId, invoiceNo, invoiceDate, items, onSaved, onError, previewOnly = false, onPreviewDraft }: {
  processedImage: string | null
  vendorId: string
  invoiceNo: string
  invoiceDate: string
  items: OcrItem[]
  onSaved: (data: ReceivingWorkspace, text: string) => void
  onError: (text: string) => void
  previewOnly?: boolean
  onPreviewDraft?: (data: { text: string; lines: InvoiceOcrDraftLine[] }) => void
}) {
  const [rawText, setRawText] = useState('')
  const [lines, setLines] = useState<InvoiceOcrDraftLine[]>([])
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [controller, setController] = useState<AbortController | null>(null)

  const catalogItems = items.map((item) => ({
    itemId: item.id,
    catalogNo: item.catalogNo ?? null,
    itemCode: item.itemCode,
    name: item.name,
    manufacturer: item.manufacturer ?? null,
    vendor: item.supplier ?? null,
  }))

  function updateLine(lineNo: number, key: keyof InvoiceOcrDraftLine, value: string) {
    setLines((current) => current.map((line) => {
      if (line.lineNo !== lineNo) return line
      const nextValue = key === 'expectedQty' ? (Number(value) > 0 ? Number(value) : 1) : value || null
      if (key === 'catalogNoText') return { ...line, catalogNoText: nextValue as string | null, stockItemId: null, descriptionText: null, matchMethod: 'unmatched', matchConfidence: null, candidateItemIds: [] }
      return { ...line, [key]: nextValue }
    }))
  }

  function chooseCandidate(lineNo: number, itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId)
    setLines((current) => current.map((line) => line.lineNo === lineNo ? {
      ...line,
      stockItemId: item?.id ?? null,
      descriptionText: item?.name ?? null,
      catalogNoText: item?.catalogNo ?? line.catalogNoText,
      matchMethod: item ? 'manual' : 'unmatched',
      matchConfidence: null,
    } : line))
  }

  async function runOcr() {
    if (!processedImage) return
    const nextController = new AbortController()
    setController(nextController)
    setBusy(true)
    setError(null)
    setProgress({ status: 'กำลังเตรียมภาพ', progress: 0 })
    try {
      const result = await recognizeProcessedInvoiceImage(processedImage, { signal: nextController.signal, onProgress: setProgress })
      setRawText(result.text)
      setLines(buildInvoiceOcrDraftLines(result.text, catalogItems))
      setProgress({ status: 'อ่านข้อความเสร็จแล้ว — ตรวจสอบ draft ก่อนบันทึก', progress: 1 })
    } catch (ocrError) {
      if (ocrError instanceof Error && ocrError.name === 'AbortError') setError('ยกเลิก OCR แล้ว')
      else setError(ocrError instanceof Error ? ocrError.message : 'OCR ไม่สำเร็จ')
    } finally {
      setBusy(false)
      setController(null)
    }
  }

  function rebuildSuggestions() {
    setLines(buildInvoiceOcrDraftLines(rawText, catalogItems))
    setError(null)
  }

  async function saveDraft() {
    if (!vendorId || !rawText.trim() || !lines.length) return
    setSaving(true)
    setError(null)
    try {
      if (previewOnly) {
        onPreviewDraft?.({ text: rawText, lines })
        return
      }
      const form = new FormData()
      form.set('vendorId', vendorId)
      form.set('invoiceNo', invoiceNo)
      form.set('invoiceDate', invoiceDate)
      form.set('rawText', rawText)
      form.set('engine', 'tesseract.js')
      form.set('engineVersion', '7.0.0')
      form.set('languages', 'tha+eng')
      form.set('lines', JSON.stringify(lines.map(({ lineNo, sourceText, catalogNoText, lotText, expiryText, expectedQty, stockItemId, matchMethod, matchConfidence, candidateItemIds }) => ({ lineNo, sourceText, catalogNoText, lotText, expiryText, expectedQty, stockItemId, matchMethod, matchConfidence, candidateItemIds }))))
      const result = await api<{ receiving: ReceivingWorkspace }>('/api/receiving/ocr/jobs', { method: 'POST', body: form })
      onSaved(result.receiving, 'สร้าง OCR invoice draft แล้ว — กรุณาตรวจสอบ match และ quantity ก่อนรับเข้า')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'บันทึก OCR draft ไม่สำเร็จ')
      onError(saveError instanceof Error ? saveError.message : 'บันทึก OCR draft ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  function matchBadge(line: InvoiceOcrDraftLine) {
    if (line.matchMethod === 'exact_unique') return <StatusBadge tone="accepted" label="exact unique — ตรวจทาน" />
    if (line.matchMethod === 'exact_ambiguous') return <StatusBadge tone="investigate" label="exact ambiguous — ต้องเลือก" />
    if (line.matchMethod === 'similar') return <StatusBadge tone="investigate" label="similar — ข้อเสนอแนะ" />
    if (line.matchMethod === 'manual') return <StatusBadge tone="accepted" label="manual — operator เลือกแล้ว" />
    return <StatusBadge tone="neutral" label="unmatched — เลือกเอง" />
  }

  return <Card className="space-y-3 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Invoice OCR draft</p><h3 className="mt-1 text-base font-bold text-[#173d50]">อ่านข้อความจากภาพที่ยืนยันแล้ว</h3><p className="mt-1 text-xs leading-5 text-[#81979c]">OCR เป็นเพียงข้อเสนอแนะ ไม่เขียน stock และไม่ส่งภาพออกนอก browser{previewOnly ? ' · Preview acceptance จะเก็บผลไว้ใน browser เท่านั้น' : ''}</p></div><FileScan className="size-5 text-[#0b7f76]" aria-hidden="true" /></div>
    {!processedImage ? <Notice tone="warning">ยืนยันภาพ crop หรือเลือก Skip Crop ก่อนเริ่ม OCR</Notice> : <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-start"><img src={processedImage} alt="Confirmed invoice image for OCR" className="max-h-60 w-full rounded-md border border-[#dce8e9] bg-[#f8fbfb] object-contain" /><div className="space-y-2"><Button type="button" disabled={busy || saving} onClick={() => void runOcr()}><FileScan className="size-4" />เริ่ม OCR จากภาพที่ยืนยัน</Button>{busy ? <Button type="button" variant="secondary" onClick={() => controller?.abort()}><Square className="size-4" />ยกเลิก OCR</Button> : null}{progress ? <div className="rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-2 text-xs text-[#58747d]"><Loading label={progress.status} /><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dce8e9]"><div className="h-full bg-[#0b7f76] transition-all" style={{ width: `${Math.round(progress.progress * 100)}%` }} /></div></div> : null}</div></div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {rawText ? <Field label="Raw OCR text" hint="แก้ข้อความได้ แล้วกดสร้างข้อเสนอแนะใหม่ก่อนบันทึก"><Textarea value={rawText} onChange={(event) => setRawText(event.target.value)} rows={6} /></Field> : null}
      {rawText ? <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy || saving} onClick={rebuildSuggestions}><RefreshCcw className="size-4" />สร้างข้อเสนอแนะใหม่</Button><Button type="button" disabled={saving || busy || !vendorId || !lines.length} onClick={() => void saveDraft()}><CheckCircle2 className="size-4" />{previewOnly ? 'เก็บผล OCR ใน Preview (ไม่บันทึก DB)' : 'บันทึก OCR invoice draft'}</Button></div> : null}
      {lines.length ? <div className="space-y-2"><p className="text-xs font-bold tracking-[0.12em] text-[#315763] uppercase">Candidate review</p>{lines.map((line) => <div key={line.lineNo} className="space-y-2 rounded-md border border-[#dce8e9] bg-[#fbfdfd] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#315763]">#{line.lineNo} · {line.sourceText}</p>{matchBadge(line)}</div>{line.candidateItemIds.length ? <Field label="เลือก Item Master"><Select value={line.stockItemId ?? ''} onChange={(event) => chooseCandidate(line.lineNo, event.target.value)}><option value="">ยังไม่เลือก — draft จะคงเป็น unmatched</option>{line.candidateItemIds.map((id) => { const item = items.find((candidate) => candidate.id === id); return <option key={id} value={id}>{item ? `${item.itemCode} · ${item.name}` : id}</option> })}</Select></Field> : null}<div className="grid gap-2 sm:grid-cols-4"><Field label="Catalog / REF"><Input value={line.catalogNoText ?? ''} onChange={(event) => updateLine(line.lineNo, 'catalogNoText', event.target.value)} placeholder="ตรวจ/กรอก catalog" /></Field><Field label="Lot"><Input value={line.lotText ?? ''} onChange={(event) => updateLine(line.lineNo, 'lotText', event.target.value)} /></Field><Field label="Expiry"><Input value={line.expiryText ?? ''} onChange={(event) => updateLine(line.lineNo, 'expiryText', event.target.value)} /></Field><Field label="Expected qty"><Input type="number" min="0.001" step="0.001" value={line.expectedQty} onChange={(event) => updateLine(line.lineNo, 'expectedQty', event.target.value)} /></Field></div><p className="text-xs text-[#58747d]">Item Master: {line.descriptionText ?? 'ยังไม่จับคู่ — ห้ามใช้ชื่อจาก OCR เป็นชื่อสินค้า'}</p></div>)}</div> : null}
    </>}
  </Card>
}
