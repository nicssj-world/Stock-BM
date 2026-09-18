'use client'

import { useState } from 'react'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import type { Invoice, ReceivingWorkspace } from '@/lib/receiving/types'
import { cumulativeReceived, deliveryCompleteness } from '@/lib/receiving/rules'
import { api, Button, Card, Field, Input, StatusBadge } from '@/components/ui'
import { InvoiceImageCrop, type InvoiceImageCropResult } from '@/components/receiving/invoice-image-crop'
import { InvoiceOcr } from '@/components/receiving/invoice-ocr'

type DraftLine = { lineNo: number; catalogNoText: string; descriptionText: string; expectedQty: string }

function blankLine(lineNo: number): DraftLine {
  return { lineNo, catalogNoText: '', descriptionText: '', expectedQty: '1' }
}

export function InvoiceEditor({ data, onSaved, onError }: { data: ReceivingWorkspace; onSaved: (data: ReceivingWorkspace, text: string) => void; onError: (text: string) => void }) {
  const activeVendors = data.vendors.filter((vendor) => vendor.isActive)
  const [vendorId, setVendorId] = useState(activeVendors[0]?.id ?? '')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([blankLine(1)])
  const [invoiceImage, setInvoiceImage] = useState<InvoiceImageCropResult | null>(null)
  const [busy, setBusy] = useState(false)

  function patchLine(index: number, key: keyof DraftLine, value: string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line))
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index).map((line, lineIndex) => ({ ...line, lineNo: lineIndex + 1 })))
  }

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault()
    if (!vendorId) return
    setBusy(true)
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>('/api/receiving/invoices', {
        method: 'POST',
        body: JSON.stringify({
          vendorId,
          invoiceNo: invoiceNo || null,
          invoiceDate: invoiceDate || null,
          status: 'open',
          lines: lines.filter((line) => line.descriptionText.trim() || line.catalogNoText.trim()).map((line) => ({
            lineNo: line.lineNo,
            catalogNoText: line.catalogNoText || null,
            descriptionText: line.descriptionText || null,
            expectedQty: Number(line.expectedQty),
            closureState: 'open',
          })),
        }),
      })
      setInvoiceNo('')
      setInvoiceDate('')
      setLines([blankLine(1)])
      onSaved(result.receiving, 'สร้างใบส่งของและรายการคาดหมายแล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'สร้างใบส่งของไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function updateExpectedQty(invoice: Invoice, lineId: string, value: string) {
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>(`/api/receiving/invoices/${invoice.id}/lines/${lineId}`, { method: 'PATCH', body: JSON.stringify({ expectedQty: Number(value) }) })
      onSaved(result.receiving, 'แก้ไข expected qty แล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'แก้ไข expected qty ไม่สำเร็จ')
    }
  }

  function onOcrSaved(next: ReceivingWorkspace, text: string) {
    setInvoiceImage(null)
    setInvoiceNo('')
    setInvoiceDate('')
    setLines([blankLine(1)])
    onSaved(next, text)
  }

  return <div className="space-y-4">
    <InvoiceImageCrop onConfirmed={setInvoiceImage} />
    {invoiceImage ? <p className="text-xs text-[#58747d]">ภาพ invoice ที่ยืนยันแล้วพร้อมสำหรับ OCR draft — ระบบยังไม่เขียน stock จากภาพนี้</p> : null}
    <InvoiceOcr processedImage={invoiceImage?.processedImage ?? null} vendorId={vendorId} invoiceNo={invoiceNo} invoiceDate={invoiceDate} items={data.items} onSaved={onOcrSaved} onError={onError} />
    <Card className="p-4">
      <form onSubmit={createInvoice} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Vendor"><select required className="min-h-11 w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm" value={vendorId} onChange={(event) => setVendorId(event.target.value)}><option value="">เลือก vendor</option>{activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.name}</option>)}</select></Field>
          <Field label="เลขที่ใบส่งของ"><Input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} placeholder="ไม่บังคับในร่าง" /></Field>
          <Field label="วันที่ใบส่งของ"><Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></Field>
        </div>
        <div className="space-y-2 rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold tracking-[0.12em] text-[#315763] uppercase">Expected lines</p><p className="text-xs text-[#81979c]">ไม่ใช้ due date ที่ยังไม่มี policy หรือแหล่งข้อมูล</p></div><Button type="button" variant="secondary" onClick={() => setLines((current) => [...current, blankLine(current.length + 1)])}><Plus className="size-4" />เพิ่มรายการ</Button></div>
          {lines.map((line, index) => <div key={line.lineNo} className="grid gap-2 border-t border-[#e5eeee] pt-3 sm:grid-cols-[auto_1fr_1.5fr_120px_auto] sm:items-end"><span className="pb-3 text-xs font-bold text-[#789097]">#{line.lineNo}</span><Field label="Catalog / REF"><Input value={line.catalogNoText} onChange={(event) => patchLine(index, 'catalogNoText', event.target.value)} /></Field><Field label="รายละเอียด"><Input value={line.descriptionText} onChange={(event) => patchLine(index, 'descriptionText', event.target.value)} /></Field><Field label="Expected qty"><Input type="number" min="0.001" step="0.001" value={line.expectedQty} onChange={(event) => patchLine(index, 'expectedQty', event.target.value)} required /></Field><Button type="button" variant="ghost" aria-label={`ลบรายการ ${line.lineNo}`} disabled={lines.length === 1} onClick={() => removeLine(index)}><Trash2 className="size-4" /></Button></div>)}
        </div>
        <Button disabled={busy || !vendorId}><ClipboardList className="size-4" />สร้างใบส่งของ</Button>
      </form>
    </Card>
    <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3"><ClipboardList className="size-4 text-[#0b7f76]" /><h2 className="font-bold">ใบส่งของและ Expected vs Received</h2></div><div className="divide-y divide-[#edf2f2]">{data.invoices.map((invoice) => <InvoiceSummary key={invoice.id} invoice={invoice} data={data} onUpdateExpectedQty={updateExpectedQty} />)}{!data.invoices.length ? <p className="p-8 text-center text-sm text-[#81979c]">ยังไม่มีใบส่งของ</p> : null}</div></Card>
  </div>
}

function InvoiceSummary({ invoice, data, onUpdateExpectedQty }: { invoice: Invoice; data: ReceivingWorkspace; onUpdateExpectedQty: (invoice: Invoice, lineId: string, value: string) => void }) {
  const vendor = data.vendors.find((item) => item.id === invoice.vendorId)
  return <div className="space-y-3 px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-[#315763]">{invoice.invoiceNo ?? 'ยังไม่มีเลขที่'} · {vendor?.name ?? 'ไม่พบ vendor'}</p><p className="text-xs text-[#81979c]">{invoice.invoiceDate ?? 'ไม่ระบุวันที่'} · {invoice.status} · {invoice.lines.length} lines</p></div><StatusBadge tone={invoice.status === 'closed' ? 'accepted' : invoice.status === 'cancelled' ? 'neutral' : 'warning'} label={invoice.status} /></div>{invoice.lines.map((line) => { const receivedQty = cumulativeReceived(data.receipts.filter((receipt) => receipt.status === 'confirmed').flatMap((receipt) => receipt.lines.filter((receiptLine) => receiptLine.invoiceLineId === line.id).map((receiptLine) => ({ receivedQty: receiptLine.receivedQty })))); const state = deliveryCompleteness(line.expectedQty, receivedQty); return <div key={line.id} className="grid gap-2 rounded-md border border-[#e1eaeb] bg-[#fbfdfd] p-3 sm:grid-cols-[1fr_130px_130px_auto] sm:items-center"><div><p className="text-sm font-semibold text-[#315763]">{line.catalogNoText ?? 'ไม่มี Catalog / REF'} · {line.descriptionText ?? 'ไม่มีรายละเอียด'}</p><p className="text-xs text-[#81979c]">สถานะ: {line.closureState} · received {receivedQty} / expected {line.expectedQty}</p></div><Input aria-label={`Expected qty ${line.lineNo}`} type="number" min="0.001" step="0.001" defaultValue={line.expectedQty} disabled={invoice.status === 'closed' || invoice.status === 'cancelled'} onBlur={(event) => { if (Number(event.currentTarget.value) !== line.expectedQty) onUpdateExpectedQty(invoice, line.id, event.currentTarget.value) }} /><span className="text-sm font-semibold text-[#58747d]">{state === 'complete' ? 'ครบแล้ว' : 'ยังเปิดอยู่'}</span><StatusBadge tone={state === 'complete' ? 'accepted' : 'warning'} label={state} /></div> })}</div>
}
