'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ClipboardCheck, Clock3, X } from 'lucide-react'
import {
  EMPTY_ASSESSMENT_ANSWERS,
  assessmentIssues,
  normalizeAssessmentAnswers,
  type ReceiptAssessmentAnswers,
  type ReceiptQuantitySummary,
} from '@/lib/receiving/assessment'
import { Button, Notice } from '@/components/ui'
import { AssessmentFields } from '@/components/receiving/assessment-fields'

export type ReceiptAssessmentContext = {
  receiptId: string
  receiptLabel: string
  vendorLabel: string
  receivedDate: string
  quantity: ReceiptQuantitySummary
}

/**
 * Opens after a receipt is committed. The stock transaction has already
 * succeeded: dismissing leaves the assessment Pending and never rolls back.
 * There is no quantity question — the quantity block is read from the receipt.
 */
export function ReceiptAssessmentDialog({ context, onSubmit, onDismiss }: { context: ReceiptAssessmentContext; onSubmit: (answers: ReceiptAssessmentAnswers) => Promise<void>; onDismiss: () => void }) {
  const [answers, setAnswers] = useState<ReceiptAssessmentAnswers>(EMPTY_ASSESSMENT_ANSWERS)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const issues = assessmentIssues(answers)
  const invalid = (field: keyof ReceiptAssessmentAnswers) => attempted && issues.some((issue) => issue.field === field)

  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onDismiss])

  function patch(next: Partial<ReceiptAssessmentAnswers>) {
    setAnswers((current) => ({ ...current, ...next }))
  }

  async function save() {
    setAttempted(true)
    if (issues.length) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(normalizeAssessmentAnswers(answers))
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'บันทึกการประเมินไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const q = context.quantity
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0d2430]/60 sm:items-center sm:p-4">
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-[#e1eaeb] px-4 py-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Receipt Assessment</p>
          <h2 id={titleId} className="mt-0.5 text-lg font-bold text-[#173d50]">ประเมินการรับสินค้า</h2>
          <p className="text-xs text-[#58747d]">{context.receiptLabel} · {context.vendorLabel} · {context.receivedDate}</p>
        </div>
        <button type="button" className="grid size-11 place-items-center rounded-md text-[#58747d] hover:bg-[#f1f6f6]" aria-label="ปิด — ประเมินภายหลัง" disabled={busy} onClick={onDismiss}><X className="size-5" /></button>
      </div>

      <div className="space-y-4 overflow-y-auto px-4 py-4">
        <Notice tone="success">รับเข้าสำเร็จและบันทึก stock แล้ว — การปิดหน้าต่างนี้ไม่ยกเลิกการรับ (การประเมินจะอยู่ในสถานะ Pending)</Notice>

        <section className="rounded-md border border-[#dce8e9] bg-[#f8fbfb] p-3" aria-label="จำนวนที่ได้รับจากใบรับเข้า">
          <p className="text-xs font-bold text-[#315763]">จำนวนจากใบรับเข้า (ไม่ต้องกรอกซ้ำ)</p>
          <ul className="mt-2 space-y-1 text-xs text-[#58747d]">
            {q.lines.map((line) => <li key={line.lineNo} className="flex justify-between gap-2"><span className="min-w-0 truncate">#{line.lineNo} {line.itemLabel}</span><span className="mono shrink-0 font-semibold text-[#173d50]">{line.receivedQty} {line.unit}{line.expectedQty != null ? ` · สะสม ${line.cumulativeReceivedQty ?? line.receivedQty}/${line.expectedQty}` : ''}</span></li>)}
          </ul>
          {q.linesWithExpected ? <p className="mt-2 text-[11px] text-[#81979c]">ครบตามที่คาดหมาย {q.linesReachedExpected}/{q.linesWithExpected} รายการ · ยังไม่ครบ {q.linesPartial}{q.linesOverExpected ? ` · เกิน ${q.linesOverExpected}` : ''}</p> : <p className="mt-2 text-[11px] text-[#81979c]">ไม่ได้ผูกกับรายการคาดหมาย — บันทึกเฉพาะจำนวนที่ได้รับจริง</p>}
        </section>

        <AssessmentFields answers={answers} onChange={patch} invalid={invalid} />

        {attempted && issues.length ? <Notice tone="danger">{issues[0].message}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
        <Button type="button" variant="ghost" disabled={busy} onClick={onDismiss}><Clock3 className="size-4" />ประเมินภายหลัง</Button>
        <Button type="button" disabled={busy} onClick={() => void save()}><ClipboardCheck className="size-4" />บันทึกการประเมิน</Button>
      </div>
    </div>
  </div>
}
