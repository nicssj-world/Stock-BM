'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpFromLine, Camera, ScanLine, Trash2, X } from 'lucide-react'
import type { LotIssueContext } from '@/lib/bm/types'
import { formatQuantity } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from '@/components/ui'

interface BatchLine {
  key: string
  ctx: LotIssueContext
  locationId: string
  quantity: string
  error?: string
}

// Batch issue: scan many lots continuously (camera or Bluetooth scanner), one shared
// purpose, submit once. Each line issues independently; failures are reported per line.
export function BatchIssue() {
  const [lines, setLines] = useState<BatchLine[]>([])
  const [manual, setManual] = useState('')
  const [purpose, setPurpose] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const processingRef = useRef(false)
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })

  async function addByCode(code: string) {
    const trimmed = code.trim()
    if (!trimmed || processingRef.current) return
    const now = Date.now()
    if (trimmed === lastRef.current.code && now - lastRef.current.at < 1500) return
    lastRef.current = { code: trimmed, at: now }
    processingRef.current = true
    try {
      const { context } = await api<{ context: LotIssueContext }>('/api/stock/issue-context', { method: 'POST', body: JSON.stringify({ code: trimmed }) })
      if (!context.balances.length) { setNotice({ tone: 'warning', text: `${context.itemCode} LOT ${context.lotNumber} ไม่มีของคงเหลือ` }); return }
      setLines((current) => {
        const existing = current.find((line) => line.ctx.lotId === context.lotId)
        if (existing) {
          const step = context.defaultIssueQty ?? 1
          return current.map((line) => (line.ctx.lotId === context.lotId ? { ...line, quantity: String((Number(line.quantity) || 0) + step) } : line))
        }
        return [
          ...current,
          {
            key: `${context.lotId}-${now}`,
            ctx: context,
            locationId: context.suggestedLocationId ?? context.balances[0]?.locationId ?? '',
            quantity: context.defaultIssueQty != null ? String(context.defaultIssueQty) : '',
          },
        ]
      })
      setNotice(null)
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'อ่าน QR ไม่สำเร็จ' })
    } finally {
      processingRef.current = false
    }
  }

  useEffect(() => {
    if (!cameraOn || !videoRef.current) return
    let stopped = false
    let controls: { stop: () => void } | undefined
    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          const text = result?.getText()
          if (text && !stopped) void addByCode(text)
        })
      } catch {
        setNotice({ tone: 'danger', text: 'เปิดกล้องไม่ได้' })
        setCameraOn(false)
      }
    }
    start()
    return () => { stopped = true; controls?.stop() }
  }, [cameraOn])

  function updateLine(key: string, patch: Partial<BatchLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }
  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key))
  }

  const canSubmit = lines.length > 0 && purpose.trim() !== '' && lines.every((line) => Number(line.quantity) > 0 && line.locationId)

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setNotice(null)
    try {
      const payload = {
        purpose: purpose.trim(),
        reference: reference.trim() || null,
        note: note.trim() || null,
        lines: lines.map((line) => ({
          lotId: line.ctx.lotId,
          locationId: line.locationId,
          quantity: Number(line.quantity),
          expiredConfirmed: line.ctx.expiryState === 'expired',
        })),
      }
      const { results } = await api<{ results: { lotId: string; ok: boolean; error?: string }[] }>('/api/stock/issues/batch', { method: 'POST', body: JSON.stringify(payload) })
      const failed = results.filter((r) => !r.ok)
      if (!failed.length) {
        setLines([])
        setNotice({ tone: 'success', text: `ตัด stock สำเร็จ ${results.length} รายการ` })
      } else {
        const failedIds = new Set(failed.map((r) => r.lotId))
        setLines((current) => current.filter((line) => failedIds.has(line.ctx.lotId)).map((line) => ({ ...line, error: failed.find((r) => r.lotId === line.ctx.lotId)?.error })))
        setNotice({ tone: 'warning', text: `สำเร็จ ${results.length - failed.length}, ไม่สำเร็จ ${failed.length} (ดูบรรทัดที่เหลือ)` })
      }
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ตัด stock ไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 sm:pb-5">
      <Link href="/scan" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7f76]"><ScanLine className="size-4" /> สแกนเดี่ยว</Link>
      <PageHeader eyebrow="ตัด stock — batch" title="ตัดหลายรายการ" description="ยิง QR หลาย lot ต่อเนื่อง ใส่ purpose ครั้งเดียว แล้วตัดพร้อมกัน" />

      <Card className="p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <form onSubmit={(e) => { e.preventDefault(); void addByCode(manual); setManual('') }} className="relative">
            <ScanLine className="absolute top-3 left-3 size-5 text-[#88a1a7]" />
            <Input value={manual} onChange={(e) => setManual(e.target.value)} className="h-12 pl-11 mono text-base" placeholder="ยิงบาร์โค้ด / วาง token แล้ว Enter" />
          </form>
          <Button type="button" variant="secondary" className="h-12" onClick={() => setCameraOn((v) => !v)}>{cameraOn ? <X className="size-4" /> : <Camera className="size-4" />} {cameraOn ? 'ปิดกล้อง' : 'กล้อง'}</Button>
        </div>
        {cameraOn ? <div className="mt-3 overflow-hidden rounded-md border border-[#d6e2e3] bg-black"><video ref={videoRef} className="aspect-video w-full object-cover" /></div> : null}
      </Card>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {lines.length ? (
        <Card className="divide-y divide-[#eef3f3] p-0">
          {lines.map((line) => (
            <div key={line.key} className="flex flex-wrap items-end gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#173d50]">{line.ctx.itemCode} <span className="text-xs font-normal text-[#789097]">{line.ctx.itemName}</span></p>
                <p className="mono text-xs text-[#789097]">LOT {line.ctx.lotNumber}{line.ctx.expiryState === 'expired' ? ' · หมดอายุ' : ''}</p>
                {line.error ? <p className="text-xs font-semibold text-[#c02a37]">{line.error}</p> : null}
              </div>
              <Field label="Location">
                <Select value={line.locationId} onChange={(e) => updateLine(line.key, { locationId: e.target.value })} className="h-10 w-36">
                  {line.ctx.balances.map((b) => <option key={b.locationId} value={b.locationId}>{b.locationCode} ({formatQuantity(b.onHand)})</option>)}
                </Select>
              </Field>
              <Field label={`จำนวน (${line.ctx.unit})`}>
                <Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} className="mono h-10 w-24 text-base font-bold" />
              </Field>
              <Button type="button" variant="ghost" className="h-10" onClick={() => removeLine(line.key)} aria-label="ลบบรรทัด"><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </Card>
      ) : (
        <Card className="p-8 text-center text-sm text-[#789097]">ยังไม่มีรายการ — ยิง QR หรือวาง token ด้านบน</Card>
      )}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Purpose (ใช้ทั้ง batch)"><Input required value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="เช่น NIPT run" className="h-11" /></Field>
          <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-11" /></Field>
          <div className="sm:col-span-2"><Field label="Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
        </div>
      </Card>

      <div className="fixed right-0 bottom-0 left-0 z-30 border-t border-[#d6e2e3] bg-white/95 px-4 py-3 shadow-[0_-18px_40px_rgba(20,64,72,0.14)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-sm font-bold text-[#173d50]">{lines.length} รายการ</p>
          <Button disabled={busy || !canSubmit} className="h-12 min-w-40" onClick={submit}><ArrowUpFromLine className="size-4" /> {busy ? 'กำลังตัด…' : 'ตัด stock ทั้งหมด'}</Button>
        </div>
      </div>
    </div>
  )
}
