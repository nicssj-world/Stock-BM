'use client'

import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import type { StockItem, StockLot, StockWorkspace } from '@/lib/bm/types'
import { formatDate, formatQuantity } from '@/lib/bm/rules'
import { api, Button, Field, Notice, Textarea } from '@/components/ui'

/** Confirm writing off every remaining unit of an expired lot (all locations) in one step. */
export function DiscardExpiredDialog({ item, lot, onClose, onDone }: { item: StockItem; lot: StockLot; onClose: () => void; onDone: (stock: StockWorkspace, text: string) => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const balances = lot.balances.filter((balance) => balance.onHand > 0)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ stock: StockWorkspace; results: { locationCode: string; ok: boolean; error?: string }[] }>(`/api/stock/lots/${lot.id}/discard`, {
        method: 'POST',
        body: JSON.stringify({ note: note.trim() || null }),
      })
      const failed = result.results.filter((line) => !line.ok)
      onDone(result.stock, failed.length
        ? `ตัดทิ้ง ${item.itemCode} lot ${lot.lotNumber} บางส่วน — ไม่สำเร็จที่ ${failed.map((line) => line.locationCode).join(', ')}`
        : `ตัดทิ้ง ${item.itemCode} lot ${lot.lotNumber} แล้ว ${formatQuantity(lot.totalOnHand)} ${item.unit}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ตัดทิ้งไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#08242b]/35 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:pb-3" onClick={() => { if (!busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="discard-expired-title" className="max-h-[90dvh] w-full overflow-y-auto rounded-lg border border-[#d6e2e3] bg-white shadow-[0_-18px_40px_rgba(20,64,72,0.18)] sm:max-w-md sm:rounded-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[#e0e9ea] px-4 py-3">
          <div className="min-w-0">
            <p className="mono text-xs font-bold text-[#b33b46]">{item.itemCode} · {lot.lotNumber}</p>
            <h2 id="discard-expired-title" className="mt-0.5 font-bold text-[#173d50]">ตัดทิ้ง lot หมดอายุ</h2>
            <p className="mt-0.5 text-xs text-[#789097]">{item.name} · EXP {formatDate(lot.expiryDate)}</p>
          </div>
          <button type="button" aria-label="ปิด" disabled={busy} onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-md text-[#789097] hover:bg-[#eef5f4]"><X className="size-5" /></button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-[#315763]">ระบบจะตัดยอดคงเหลือทั้งหมดของ lot นี้ให้เป็น 0 และบันทึกเป็นการจ่ายออก (purpose: ทิ้ง — หมดอายุ) ตามที่อยู่ด้านล่าง</p>
          <ul className="divide-y divide-[#edf2f2] rounded-md border border-[#e1ebec] text-sm">
            {balances.map((balance) => (
              <li key={balance.locationId} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-[#315763]">{balance.locationCode} · {balance.locationName}</span>
                <span className="mono font-bold text-[#173d50]">{formatQuantity(balance.onHand)} {item.unit}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 bg-[#f7fbfb] px-3 py-2 font-semibold">
              <span className="text-[#315763]">รวมที่จะตัดทิ้ง</span>
              <span className="mono text-[#b33b46]">{formatQuantity(lot.totalOnHand)} {item.unit}</span>
            </li>
          </ul>
          <Field label="หมายเหตุ (ไม่บังคับ)">
            <Textarea rows={2} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="เช่น ทิ้งเป็นขยะติดเชื้อ, ผู้ทำลาย, เลขที่ใบทำลาย" />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>ยกเลิก</Button>
            <Button type="button" variant="danger" disabled={busy || !balances.length} onClick={confirm}><Trash2 className="size-4" aria-hidden="true" /> {busy ? 'กำลังตัดทิ้ง…' : 'ยืนยันตัดทิ้ง'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
