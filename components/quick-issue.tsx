'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpFromLine, CheckCircle2, MapPin, MoveRight, ScanLine } from 'lucide-react'
import type { LotIssueContext, StockWorkspace } from '@/lib/bm/types'
import { formatDate, formatQuantity } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Textarea } from '@/components/ui'

// One-screen quick issue reached by scanning a lot QR sticker. Lot is fixed by the
// scan; location is FEFO-suggested, quantity prefilled from the item default.
export function QuickIssue({ context }: { context: LotIssueContext }) {
  const [locationId, setLocationId] = useState(context.suggestedLocationId ?? context.balances[0]?.locationId ?? '')
  const [quantity, setQuantity] = useState(context.defaultIssueQty != null ? String(context.defaultIssueQty) : '')
  const [purpose, setPurpose] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [needOverride, setNeedOverride] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const balance = context.balances.find((b) => b.locationId === locationId)
  const expired = context.expiryState === 'expired'
  const canSave = Boolean(balance && quantity && purpose.trim())

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!balance) return
    const qty = Number(quantity)
    if (!(qty > 0)) { setError('จำนวนต้องมากกว่า 0'); return }
    if (qty > balance.onHand) { setError(`เกินคงเหลือ (${formatQuantity(balance.onHand)} ${context.unit})`); return }
    if (expired && !window.confirm(`Lot ${context.lotNumber} หมดอายุแล้ว ยืนยันการตัด stock?`)) return
    setBusy(true)
    setError('')
    try {
      await api<{ stock: StockWorkspace }>('/api/stock/issues', {
        method: 'POST',
        body: JSON.stringify({
          lotId: context.lotId,
          locationId,
          quantity: qty,
          purpose: purpose.trim(),
          reference: reference.trim() || null,
          note: note.trim() || null,
          overrideReason: overrideReason.trim() || null,
          expiredConfirmed: expired,
        }),
      })
      setDone(true)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'ตัด stock ไม่สำเร็จ'
      if (/override/i.test(message)) setNeedOverride(true)
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Notice tone="success"><CheckCircle2 className="size-4" /> ตัด stock แล้ว: {context.itemCode} · {formatQuantity(Number(quantity))} {context.unit}</Notice>
        <div className="flex gap-2">
          <Link href="/scan" className="flex-1"><Button className="h-12 w-full"><ScanLine className="size-4" /> สแกนตัวถัดไป</Button></Link>
          <Link href="/inventory" className="flex-1"><Button variant="secondary" className="h-12 w-full">เสร็จ / ไปคลัง</Button></Link>
        </div>
      </div>
    )
  }

  if (!context.balances.length) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <PageHeader eyebrow="ตัด stock" title="Quick issue" description={`${context.itemCode} · LOT ${context.lotNumber}`} />
        <Notice tone="warning">Lot นี้ไม่มีของคงเหลือ / No stock on hand</Notice>
        <Link href="/inventory" className="inline-block"><Button variant="secondary">ไปคลัง / Inventory</Button></Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pb-4">
      <Link href="/scan" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7f76]"><ScanLine className="size-4" /> สแกนใหม่</Link>
      <PageHeader eyebrow="ตัด stock / Quick issue" title={context.itemName} description={`${context.itemCode} · LOT ${context.lotNumber} · EXP ${formatDate(context.expiryDate)}`} />
      {expired ? <Notice tone="danger">Lot นี้หมดอายุแล้ว / Expired lot</Notice> : null}

      <Card className="p-4">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#58747d]"><MapPin className="size-3.5" /> Location (FEFO)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {context.balances.map((b) => (
                <button
                  key={b.locationId}
                  type="button"
                  onClick={() => setLocationId(b.locationId)}
                  className={`rounded-md border px-3 py-2 text-left transition ${b.locationId === locationId ? 'border-[#0b7f76] bg-[#eef9f7] shadow-[inset_0_0_0_1px_#0b7f76]' : 'border-[#d8e6e6] bg-white hover:border-[#9fc2c3]'}`}
                >
                  <span className="block text-sm font-bold text-[#173d50]">{b.locationCode}</span>
                  <span className="mono block text-xs text-[#789097]">{formatQuantity(b.onHand)} {context.unit}</span>
                </button>
              ))}
            </div>
          </div>

          <Field label={`จำนวน / Quantity (${context.unit})`}>
            <Input
              autoFocus
              required
              type="number"
              inputMode="decimal"
              min="0.001"
              step="0.001"
              max={balance?.onHand}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="h-14 mono text-2xl font-bold"
            />
          </Field>

          <Field label="Purpose"><Input required value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="เช่น NIPT run, QC, validation" className="h-12 text-base" /></Field>
          <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-11" /></Field>
          {needOverride ? <Field label="FEFO override reason (จำเป็น)"><Input required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="h-11" /></Field> : null}
          <Field label="Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>

          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button type="submit" disabled={busy || !canSave} className="h-12 w-full text-base"><ArrowUpFromLine className="size-4" /> {busy ? 'กำลังบันทึก…' : 'ตัด stock / Save'}</Button>
        </form>
      </Card>

      <Link href={`/movements?mode=move&lotId=${context.lotId}&locationId=${locationId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7f76]"><MoveRight className="size-4" /> ย้ายที่แทน / Move instead</Link>
    </div>
  )
}
