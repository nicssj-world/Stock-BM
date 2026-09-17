'use client'

import { useMemo, useState } from 'react'
import { ClipboardCheck, FileText, MapPin, PackagePlus } from 'lucide-react'
import { remainingShelfLife, torExpiryCompliance } from '@/lib/bm/shelf-life'
import { todayBangkok } from '@/lib/bm/rules'
import type { Receipt, ReceivingWorkspace } from '@/lib/receiving/types'
import { receiptIssues } from '@/lib/receiving/rules'
import { api, Button, Card, Field, Input, Notice, Select, StatusBadge } from '@/components/ui'
import { ReceiptLineRow } from '@/components/receiving/receipt-line-row'

export function ReceiptDraft({ data, onSaved, onError }: { data: ReceivingWorkspace; onSaved: (data: ReceivingWorkspace, text: string) => void; onError: (text: string) => void }) {
  const activeVendors = data.vendors.filter((vendor) => vendor.isActive)
  const activeItems = data.items
  const activeLocations = data.locations.filter((location) => location.isActive)
  const [vendorId, setVendorId] = useState(activeVendors[0]?.id ?? '')
  const [receiptNo, setReceiptNo] = useState('')
  const [itemId, setItemId] = useState(activeItems[0]?.id ?? '')
  const [locationId, setLocationId] = useState(activeLocations[0]?.id ?? '')
  const [lotNumber, setLotNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [receivedQty, setReceivedQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const selectedItem = useMemo(() => activeItems.find((item) => item.id === itemId), [activeItems, itemId])
  const drafts = data.receipts.filter((receipt) => receipt.status === 'draft')

  async function createDraft(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const receivedDate = todayBangkok()
    const computedCompliance = torExpiryCompliance(expiryDate || null, receivedDate)
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>('/api/receiving/receipts', {
        method: 'POST',
        body: JSON.stringify({ vendorId, receiptNo: receiptNo || null, receivedDate, packagingStatus: null, temperatureStatus: null, lines: [{ lineNo: 1, stockItemId: itemId, locationId, lotNumber: lotNumber || null, expiryDate: expiryDate || null, lotMode: selectedItem?.trackLot ? 'new' : 'not_tracked', receivedQty: Number(receivedQty), torExpiryCompliance: computedCompliance === 'not_compliant' ? 'compliant' : computedCompliance, remainingShelfLifeDays: remainingShelfLife(expiryDate || null, receivedDate) }] }),
      })
      onSaved(result.receiving, 'สร้างร่างใบรับเข้าแล้ว')
      setReceiptNo(''); setLotNumber(''); setExpiryDate(''); setReceivedQty('1')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'สร้างร่างใบรับเข้าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function confirm(id: string) {
    setBusy(true)
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>(`/api/receiving/receipts/${id}/confirm`, { method: 'POST', body: '{}' })
      onSaved(result.receiving, 'ยืนยันรับเข้าและเขียน ledger แล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ยืนยันรับเข้าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return <div className="space-y-4">
    <Card className="p-4"><form onSubmit={createDraft} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2"><div className="rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3"><p className="flex items-center gap-2 text-xs font-bold text-[#315763]"><FileText className="size-4 text-[#0b7f76]" />1. Vendor + receipt</p><div className="mt-3 space-y-3"><Field label="Vendor"><Select required value={vendorId} onChange={(event) => setVendorId(event.target.value)}><option value="">เลือก vendor</option>{activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.name}</option>)}</Select></Field><Field label="เลขที่ใบรับเข้า"><Input value={receiptNo} onChange={(event) => setReceiptNo(event.target.value)} placeholder="ไม่บังคับ" /></Field></div></div>
        <div className="rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3"><p className="flex items-center gap-2 text-xs font-bold text-[#315763]"><PackagePlus className="size-4 text-[#0b7f76]" />2. Line</p><div className="mt-3 space-y-3"><Field label="Item"><Select required value={itemId} onChange={(event) => setItemId(event.target.value)}><option value="">เลือก item</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.itemCode} · {item.name}</option>)}</Select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Lot"><Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} disabled={selectedItem ? !selectedItem.trackLot : false} /></Field><Field label="จำนวน"><Input type="number" min="0.001" step="0.001" value={receivedQty} onChange={(event) => setReceivedQty(event.target.value)} required /></Field></div><Field label="Expiry"><Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} disabled={selectedItem ? !selectedItem.trackExpiry : false} /></Field></div></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2"><div className="rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3"><p className="flex items-center gap-2 text-xs font-bold text-[#315763]"><MapPin className="size-4 text-[#0b7f76]" />3. Location + evidence</p><div className="mt-3 space-y-3"><Field label="Location"><Select required value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">เลือก location</option>{activeLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</Select></Field><p className="text-xs text-[#81979c]">Packaging และ temperature จะถูกกรอกใน draft ก่อนยืนยัน</p></div></div><div className="rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3"><p className="flex items-center gap-2 text-xs font-bold text-[#315763]"><ClipboardCheck className="size-4 text-[#0b7f76]" />4. Review + confirm</p><p className="mt-3 text-xs leading-5 text-[#81979c]">ระบบจะตรวจ lot, expiry, TOR และ feature flag ซ้ำใน RPC ก่อนเขียนผ่าน ledger เดิม</p><Button className="mt-3" disabled={busy || !vendorId || !itemId || !locationId}><PackagePlus className="size-4" />สร้าง draft</Button></div></div>
    </form></Card>
    {drafts.map((receipt) => {
      const viewReceipt = { ...receipt, lines: receipt.lines.map((line) => ({ ...line, torExpiryCompliance: torExpiryCompliance(line.expiryDate, receipt.receivedDate), remainingShelfLifeDays: remainingShelfLife(line.expiryDate, receipt.receivedDate) })) }
      const issues = receiptIssues(viewReceipt, { expiryExceptionEnabled: data.policy.expiryExceptionEnabled })
      return <Card key={receipt.id} className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Draft receipt</p><h2 className="mt-1 text-lg font-bold text-[#173d50]">{receipt.receiptNo ?? receipt.id.slice(0, 8)}</h2><p className="text-xs text-[#81979c]">{receipt.lines.length} line · received date {receipt.receivedDate}</p></div><StatusBadge tone="warning" label="draft" /></div><ReceiptEvidence receipt={receipt} onSaved={(next) => onSaved(next, 'บันทึก packaging และ temperature แล้ว')} /><div className="grid gap-2">{receipt.lines.map((line) => <ReceiptLineRow key={line.id} line={line} receivedDate={receipt.receivedDate} data={data} onUpdated={(next) => onSaved(next, 'บันทึกเหตุผล TOR แล้ว')} />)}</div>{issues.length ? <Notice tone={issues.some((issue) => issue.target.includes('receiptDecision')) ? 'danger' : 'warning'}>{issues[0].message}</Notice> : <Notice tone="success">ข้อมูลพร้อมยืนยันรับสินค้า — ระบบจะตรวจสอบซ้ำในฐานข้อมูลก่อนเขียน ledger</Notice>}<Button disabled={busy || issues.length > 0 || !receipt.lines.length} onClick={() => confirm(receipt.id)}><ClipboardCheck className="size-4" />ยืนยันรับสินค้า</Button></Card>
    })}
    {!drafts.length ? <Card className="p-8 text-center text-sm text-[#81979c]">ยังไม่มี draft ใบรับเข้า — สร้างจากแบบฟอร์มด้านบน</Card> : null}
  </div>
}

function ReceiptEvidence({ receipt, onSaved }: { receipt: Receipt; onSaved: (data: ReceivingWorkspace) => void }) {
  const [temperatureValueC, setTemperatureValueC] = useState(receipt.temperatureValueC == null ? '' : String(receipt.temperatureValueC))
  const [busy, setBusy] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>(`/api/receiving/receipts/${receipt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          packagingStatus: String(form.get('packagingStatus') || '') || null,
          temperatureStatus: String(form.get('temperatureStatus') || '') || null,
          temperatureValueC: temperatureValueC === '' ? null : Number(temperatureValueC),
        }),
      })
      onSaved(result.receiving)
    } finally {
      setBusy(false)
    }
  }

  return <form onSubmit={save} className="grid gap-3 rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"><Field label="Packaging"><Select name="packagingStatus" defaultValue={receipt.packagingStatus ?? ''}><option value="">เลือกสถานะ</option><option value="acceptable">acceptable / ปกติ</option><option value="damaged">damaged / ชำรุด</option><option value="not_applicable">not applicable</option></Select></Field><Field label="Temperature"><Select name="temperatureStatus" defaultValue={receipt.temperatureStatus ?? ''}><option value="">เลือกสถานะ</option><option value="acceptable">acceptable / ปกติ</option><option value="out_of_range">out of range</option><option value="not_applicable">not applicable</option></Select></Field><Field label="Temperature °C" hint="กรอกเมื่อมีการวัดอุณหภูมิ"><Input type="number" step="0.1" value={temperatureValueC} onChange={(event) => setTemperatureValueC(event.target.value)} /></Field><Button variant="secondary" disabled={busy}>บันทึกหลักฐาน</Button></form>
}
