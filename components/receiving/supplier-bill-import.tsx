'use client'

import { useState } from 'react'
import { AlertCircle, BookmarkPlus, CheckCircle2, Download, FileSpreadsheet, PackageCheck, PackageX, RotateCcw, SquarePen } from 'lucide-react'
import { torExpiryCompliance } from '@/lib/bm/shelf-life'
import { normalizeSupplierCode, type SupplierBillImport, type SupplierBillLot } from '@/lib/receiving/supplier-bill'
import type { ReceivingWorkspace } from '@/lib/receiving/types'
import { Button, Card, Field, Notice, Select, StatusBadge } from '@/components/ui'
import { ItemPicker } from '@/components/receiving/item-picker'

export type ImportedLotState = { lot: SupplierBillLot; status: 'pending' | 'received' | 'not_received'; lineKey: string | null }

/** File picker for the supplier Bill (.xlsx), same file format as CHEM-IMMUNO-QMS. */
export function SupplierBillUpload({ disabled, vendorSelected, imported, onImport, onClear }: {
  disabled: boolean
  vendorSelected: boolean
  imported: SupplierBillImport | null
  onImport: (file: File) => Promise<void>
  onClear: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)

  async function run() {
    if (!vendorSelected) return setError('กรุณาเลือก Vendor ก่อน')
    if (!file) return setError('กรุณาเลือกไฟล์ Bill (.xlsx) ของผู้ขาย')
    setBusy(true)
    setError(null)
    try {
      await onImport(file)
      setFile(null)
      setInputKey((current) => current + 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ตรวจสอบไฟล์ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  return <div className="space-y-2 rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3">
    <div className="flex items-start gap-3">
      <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-[#0b7f76]" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#173d50]">รับเข้าจาก Excel ผู้ขาย (ไม่ต้องสแกน)</p>
        <p className="text-xs text-[#58747d]">ไฟล์ Bill (.xlsx) คอลัมน์ Bill No., Bill Date, Customer PO, RDTH Code, Material No., Description, Lot, Exp. Date, Qty · จับคู่สินค้าจาก REF/Catalog ใน Item Master · ยังไม่เพิ่ม stock จนกว่าจะยืนยัน</p>
      </div>
    </div>
    {imported ? <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-[#315763]">นำเข้า <b>Bill {imported.invoiceNumber}</b> · {imported.invoiceDate}{imported.poNumber ? ` · PO ${imported.poNumber}` : ''} · {imported.rowCount} แถว → {imported.lots.length} LOT <span className="text-xs text-[#81979c]">({imported.fileName})</span></p>
      <Button type="button" variant="ghost" disabled={disabled} onClick={onClear}>ล้างไฟล์ที่นำเข้า</Button>
    </div> : <div className="flex flex-wrap items-end gap-2">
      <input key={inputKey} type="file" aria-label="ไฟล์ Bill ของผู้ขาย" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={disabled || busy} className="min-h-11 min-w-0 flex-1 text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-[#e4eff0] file:px-3 file:font-semibold file:text-[#173d50]" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null) }} />
      <Button type="button" disabled={disabled || busy || !file || !vendorSelected} onClick={() => void run()}>{busy ? 'กำลังตรวจสอบ…' : 'Import ไฟล์'}</Button>
    </div>}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {!vendorSelected && !imported ? <p className="text-xs text-[#81979c]">เลือก Vendor ด้านบนก่อน Import</p> : null}
      <a href="/api/receiving/import/supplier-bill/template" download className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#0b7f76] underline"><Download className="size-3.5" aria-hidden />ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)</a>
    </div>
    {error ? <Notice tone="danger">{error}</Notice> : null}
  </div>
}

/** Per-LOT checklist: every LOT from the file must be received or marked not received before review. */
export function SupplierBillChecklist({ data, lots, receivedDate, locationId, onLocationChange, quickReceiveBlocked, disabled, onQuickReceive, onOpen, onNotReceived, onUndo, vendorId, onRemember }: {
  data: ReceivingWorkspace
  lots: ImportedLotState[]
  receivedDate: string
  locationId: string
  onLocationChange: (locationId: string) => void
  /** Why one-tap receive is unavailable (e.g. an invoice is linked and each line needs its invoice line). */
  quickReceiveBlocked: string | null
  disabled: boolean
  onQuickReceive: (key: string) => void
  onOpen: (key: string) => void
  onNotReceived: (key: string) => void
  onUndo: (key: string) => void
  vendorId: string
  /** Remember this LOT's RDTH/Material code → item for the Vendor. Absent = feature hidden. */
  onRemember?: (key: string, stockItemId: string) => Promise<'approved' | 'pending'>
}) {
  const [remembering, setRemembering] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [rememberBusy, setRememberBusy] = useState(false)
  const [rememberError, setRememberError] = useState<string | null>(null)

  function awaitingApproval(lot: SupplierBillLot) {
    const rdth = normalizeSupplierCode(lot.rdthCode)
    const material = normalizeSupplierCode(lot.materialNo)
    return data.supplierCodes.some((code) => code.vendorId === vendorId && code.status === 'pending' && ((code.codeKind === 'rdth' && code.codeNormalized === rdth) || (code.codeKind === 'material' && code.codeNormalized === material)))
  }

  async function remember(key: string) {
    if (!onRemember || !picked) return
    setRememberBusy(true)
    setRememberError(null)
    try {
      await onRemember(key, picked)
      setRemembering(null)
      setPicked(null)
    } catch (caught) {
      setRememberError(caught instanceof Error ? caught.message : 'บันทึกการจับคู่ไม่สำเร็จ')
    } finally {
      setRememberBusy(false)
    }
  }

  const activeLocations = data.locations.filter((location) => location.isActive)
  const pending = lots.filter((entry) => entry.status === 'pending').length
  return <Card className="space-y-3 border-[#b8ded8] p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-sm font-bold text-[#173d50]">ตรวจรับตาม Excel Bill · {lots.length} LOT</p><p className="text-xs text-[#58747d]">ตรวจนับของจริงทีละ LOT: กด “รับตามไฟล์” เมื่อจำนวนตรง หรือ “ตรวจ/แก้ไข” เพื่อแก้จำนวน / เลือกสินค้า</p></div>
      <StatusBadge tone={pending ? 'warning' : 'accepted'} label={pending ? `รอตรวจ ${pending}` : 'ตรวจครบแล้ว'} />
    </div>
    <Field label="Location สำหรับ “รับตามไฟล์”"><Select value={locationId} onChange={(event) => onLocationChange(event.target.value)} disabled={disabled}><option value="">เลือก location</option>{activeLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</Select></Field>
    {quickReceiveBlocked ? <p className="text-xs text-[#8f5f1d]">{quickReceiveBlocked}</p> : null}
    <ul className="space-y-2">{lots.map((entry) => {
      const { lot } = entry
      const matchedId = lot.match.status === 'matched' ? lot.match.itemId : null
      const item = matchedId ? data.items.find((candidate) => candidate.id === matchedId) ?? null : null
      const compliance = torExpiryCompliance(lot.expiry, receivedDate)
      const quickReason = quickReceiveBlocked ?? (!item ? 'ต้องเลือกสินค้า' : item.trackExpiry && compliance === 'not_compliant' ? 'ไม่ผ่าน TOR — ต้องระบุเหตุผล' : !locationId ? 'เลือก location ก่อน' : null)
      const done = entry.status !== 'pending'
      return <li key={lot.key} className={`rounded-md border p-3 text-sm ${entry.status === 'received' ? 'border-[#b8ded8] bg-[#f4fbf9]' : entry.status === 'not_received' ? 'border-[#e4e4e4] bg-[#f6f6f6]' : 'border-[#dce8e9]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`font-semibold text-[#173d50] ${entry.status === 'not_received' ? 'line-through' : ''}`}>{item ? `${item.catalogNo ? `REF ${item.catalogNo} · ` : ''}${item.name}` : lot.description}</p>
            <p className="text-xs text-[#58747d]">Excel แถว {lot.excelRows.join(', ')} · RDTH <span className="mono">{lot.rdthCode}</span> · Material <span className="mono">{lot.materialNo}</span></p>
            <p className="text-xs text-[#58747d]">Lot <span className="mono">{lot.lot}</span> · Exp <span className="mono">{lot.expiry}</span> · ตามไฟล์ <b>{lot.quantity}</b>{item ? ` ${item.unit}` : ''}</p>
            {lot.match.status === 'missing' ? <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#8f5f1d]"><AlertCircle className="size-3.5" />{awaitingApproval(lot) ? 'การจับคู่รหัสนี้รอ Admin อนุมัติ — รอบนี้เลือกสินค้าเองผ่าน “ตรวจ/แก้ไข”' : 'ไม่พบ REF/Material นี้ใน Item Master — “จับคู่และจำไว้” หรือเลือกเองผ่าน “ตรวจ/แก้ไข”'}</p> : null}
            {lot.match.status === 'matched' && lot.match.via !== 'rdth' ? <p className="mt-1 text-xs text-[#58747d]">จับคู่จาก Material No.</p> : null}
            {lot.match.status === 'conflict' ? <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#a83541]"><AlertCircle className="size-3.5" />รหัสชี้ไปหลายสินค้าใน Item Master — กด “ตรวจ/แก้ไข” แล้วเลือกเอง</p> : null}
            {compliance === 'not_compliant' && !done ? <p className="mt-1 text-xs font-semibold text-[#8f5f1d]">⚠ อายุคงเหลือไม่ผ่านเกณฑ์ TOR</p> : null}
          </div>
          {entry.status === 'received' ? <StatusBadge tone="accepted" label="รับแล้ว" /> : entry.status === 'not_received' ? <StatusBadge tone="neutral" label="ไม่ได้รับ" /> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {done ? <Button type="button" variant="ghost" disabled={disabled} onClick={() => onUndo(lot.key)}><RotateCcw className="size-4" />ย้อนกลับ</Button> : <>
            <Button type="button" disabled={disabled || Boolean(quickReason)} title={quickReason ?? undefined} onClick={() => onQuickReceive(lot.key)}><CheckCircle2 className="size-4" />รับตามไฟล์ ({lot.quantity})</Button>
            <Button type="button" variant="secondary" disabled={disabled} onClick={() => onOpen(lot.key)}><SquarePen className="size-4" />ตรวจ/แก้ไข</Button>
            {onRemember && lot.match.status === 'missing' && !awaitingApproval(lot) ? <Button type="button" variant="ghost" disabled={disabled} onClick={() => { setRemembering(remembering === lot.key ? null : lot.key); setPicked(null); setRememberError(null) }}><BookmarkPlus className="size-4" />จับคู่และจำไว้</Button> : null}
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => onNotReceived(lot.key)}><PackageX className="size-4" />ไม่ได้รับ</Button>
          </>}
        </div>
        {remembering === lot.key && !done ? <div className="mt-3 space-y-2 rounded-md border border-[#cfe1e2] bg-white p-3">
          <p className="text-xs text-[#315763]">เลือกสินค้าใน Item Master ที่ตรงกับ RDTH <span className="mono">{lot.rdthCode}</span> / Material <span className="mono">{lot.materialNo}</span> ของ Vendor นี้ — Admin: ใช้ได้ทันที · Staff: ส่งให้ Admin อนุมัติก่อน</p>
          <ItemPicker items={data.items} value={picked} onChange={setPicked} disabled={rememberBusy} />
          {rememberError ? <Notice tone="danger">{rememberError}</Notice> : null}
          <div className="flex flex-wrap gap-2"><Button type="button" disabled={rememberBusy || !picked} onClick={() => void remember(lot.key)}>{rememberBusy ? 'กำลังบันทึก…' : 'บันทึกการจับคู่'}</Button><Button type="button" variant="ghost" disabled={rememberBusy} onClick={() => setRemembering(null)}>ยกเลิก</Button></div>
        </div> : null}
      </li>
    })}</ul>
    {pending ? <p className="flex items-center gap-1 text-xs text-[#58747d]"><PackageCheck className="size-4" />ต้องตรวจครบทุก LOT ก่อนกด “ตรวจสอบก่อนยืนยัน”</p> : null}
  </Card>
}
