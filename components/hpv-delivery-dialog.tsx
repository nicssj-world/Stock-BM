'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, PenLine, X } from 'lucide-react'
import type { HpvSample, HpvStorageBox, HpvWorkspace } from '@/lib/hpv/types'
import { formatHpvBoxPosition, hpvCheckoutPurpose, specimenTypeLabel } from '@/lib/hpv/rules'
import { Button, Field, Input, Notice, Textarea } from '@/components/ui'
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad'

export type DeliverySample = HpvSample & { box: HpvStorageBox | null }

// Prefill the handover destination only when every selected sample agrees —
// a mixed selection has to be resolved by the person doing the handover.
function commonDestination(samples: DeliverySample[]) {
  const values = new Set(samples.map((sample) => sample.checkoutDestination ?? 'Co-testing'))
  return values.size === 1 ? [...values][0] : ''
}

export function HpvDeliveryDialog({ samples, onClose, onDone }: {
  samples: DeliverySample[]
  onClose: () => void
  onDone: (result: { workspace: HpvWorkspace; deliveryId: string; deliveryCode: string }) => void
}) {
  // Purpose is already recorded per sample (shown as tick columns in the table
  // below) — this is only sent along as a convenience summary, never edited here.
  const destination = commonDestination(samples)
  const [receiverName, setReceiverName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pad = useRef<SignaturePadHandle | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const onPadReady = useCallback((handle: SignaturePadHandle) => { pad.current = handle }, [])

  const requestClose = useCallback(() => {
    if (!pad.current?.isEmpty() && !window.confirm('ปิดหน้าต่างนี้ใช่ไหม? ลายเซ็นที่เซ็นไว้จะหายไป')) return
    onClose()
  }, [onClose])

  useEffect(() => {
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestClose])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (pad.current?.isEmpty() !== false) {
      setError('กรุณาลงลายเซ็นผู้รับตัวอย่างก่อนยืนยัน')
      return
    }
    const signature = await pad.current?.toFile()
    if (!signature) {
      setError('ไม่สามารถอ่านลายเซ็นได้ กรุณาเซ็นใหม่อีกครั้ง')
      return
    }
    const form = new FormData()
    form.set('sampleIds', JSON.stringify(samples.map((sample) => sample.id)))
    form.set('destination', destination.trim())
    form.set('receiverName', receiverName.trim())
    form.set('note', note.trim())
    form.set('signature', signature)
    setBusy(true)
    try {
      const response = await fetch('/api/hpv/storage/deliveries', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'ยืนยันรับตัวอย่างไม่สำเร็จ')
      onDone(data as { workspace: HpvWorkspace; deliveryId: string; deliveryCode: string })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'ยืนยันรับตัวอย่างไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#173d50]/45 p-4 sm:items-center"
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="ยืนยันรับตัวอย่าง"
        tabIndex={-1}
        className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none sm:max-h-[90vh]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e1eaeb] px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] text-[#0b7f76] uppercase">ยืนยันรับตัวอย่าง</p>
            <h2 className="mt-1 flex items-baseline gap-2 text-[#173d50]">
              <span className="mono text-2xl font-bold tabular-nums">{samples.length}</span>
              <span className="text-sm font-bold">ตัวอย่างที่กำลังส่งมอบ</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="ปิด"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-[#6d858d] transition hover:bg-[#eef5f4]"
          >
            <X className="size-5" />
          </button>
        </header>

        <form onSubmit={submit} className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 overflow-hidden rounded-lg border border-[#dde7e8]">
            <div className="max-h-[35vh] overflow-x-auto overflow-y-auto lg:max-h-[45vh]">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#eef4f4]">
                  <tr className="text-[10px] font-bold tracking-[0.06em] text-[#58747d] uppercase">
                    <th className="w-10 border border-[#dde7e8] px-3 py-2 text-right">#</th>
                    <th className="border border-[#dde7e8] px-3 py-2">Barcode</th>
                    <th className="border border-[#dde7e8] px-3 py-2">ประเภทตัวอย่าง</th>
                    <th className="border border-[#dde7e8] px-3 py-2">กล่อง · ตำแหน่ง</th>
                    <th className="border border-[#dde7e8] px-2 py-2 text-center">Co-testing</th>
                    <th className="border border-[#dde7e8] px-2 py-2 text-center">HPV-OHR</th>
                    <th className="border border-[#dde7e8] px-3 py-2">อื่นๆ</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((sample, index) => {
                    const purpose = hpvCheckoutPurpose(sample.checkoutDestination)
                    return (
                    <tr key={sample.id} className="odd:bg-white even:bg-[#fafcfc]">
                      <td className="mono border border-[#edf2f2] px-3 py-2 text-right text-xs tabular-nums text-[#8ba0a5]">{index + 1}</td>
                      <td className="mono border border-[#edf2f2] px-3 py-2 font-bold text-[#315763]">{sample.barcode}</td>
                      <td className="border border-[#edf2f2] px-3 py-2 text-xs text-[#55727c]">{specimenTypeLabel(sample.specimenType)}</td>
                      <td className="border border-[#edf2f2] px-3 py-2 text-xs text-[#55727c]">
                        {sample.box ? `${sample.box.boxCode} · ${formatHpvBoxPosition(sample.position)}` : 'นอก Storage box'}
                      </td>
                      <td className="border border-[#edf2f2] px-2 py-2 text-center text-[#0b7f76]">{purpose.coTesting ? <Check className="mx-auto size-4" aria-label="Co-testing" /> : null}</td>
                      <td className="border border-[#edf2f2] px-2 py-2 text-center text-[#0b7f76]">{purpose.hpvOhr ? <Check className="mx-auto size-4" aria-label="HPV-OHR" /> : null}</td>
                      <td className="border border-[#edf2f2] px-3 py-2 text-xs text-[#55727c]">{purpose.other ?? ''}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <Field label="ชื่อผู้รับตัวอย่าง (ถ้ามี)">
              <Input className="h-11" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="ชื่อ-สกุลผู้รับ" />
            </Field>
            <Field label="หมายเหตุการส่งมอบ">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <SignaturePad label="ลายเซ็นผู้รับตัวอย่าง" onReady={onPadReady} />
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button className="h-11 w-full sm:w-auto" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
                ยืนยันรับตัวอย่าง ({samples.length})
              </Button>
              <Button type="button" variant="secondary" className="h-11 w-full sm:w-auto" disabled={busy} onClick={requestClose}>ยกเลิก</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
