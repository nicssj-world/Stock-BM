'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { api, Button, Notice, StatusBadge } from '@/components/ui'
import { AssessmentFields } from '@/components/receiving/assessment-fields'
import { formatThaiDateTime } from '@/lib/bm/thai-date'
import {
  ASSESSMENT_LABELS, EMPTY_ASSESSMENT_ANSWERS, REASON_LABELS, assessmentIssues, hasAbnormalAnswer, normalizeAssessmentAnswers,
  type ReceiptAssessment, type ReceiptAssessmentAnswers,
} from '@/lib/receiving/assessment'
import type { VendorReceiptEvent } from '@/lib/server/vendors'

const answersOf = (a: ReceiptAssessment): ReceiptAssessmentAnswers => ({
  productCondition: a.productCondition, documentation: a.documentation, itemCorrectness: a.itemCorrectness, coldChainApplicable: a.coldChainApplicable,
  coldChainCondition: a.coldChainCondition, hasComplaint: a.hasComplaint, note: a.note ?? '', reasonCodes: a.reasonCodes, otherReasonDetail: a.otherReasonDetail ?? '',
})

function lines(a: ReceiptAssessmentAnswers) {
  const L = ASSESSMENT_LABELS
  return [
    { label: L.productCondition.title, value: a.productCondition ? L.productCondition.options[a.productCondition] : '—', exception: a.productCondition === 'abnormal' },
    { label: L.documentation.title, value: a.documentation ? L.documentation.options[a.documentation] : '—', exception: a.documentation === 'incomplete' },
    { label: L.itemCorrectness.title, value: a.itemCorrectness ? L.itemCorrectness.options[a.itemCorrectness] : '—', exception: a.itemCorrectness === 'problem' },
    { label: L.coldChainCondition.title, value: a.coldChainApplicable ? (a.coldChainCondition ? L.coldChainCondition.options[a.coldChainCondition] : '—') : 'ไม่เกี่ยวข้อง', exception: a.coldChainCondition === 'inappropriate' },
    { label: L.hasComplaint.title, value: a.hasComplaint ? 'มี' : 'ไม่มี', exception: a.hasComplaint === true },
  ]
}

/** One receipt event: read-only answers by default; an Admin can revise them and every revision is kept (LABCBH ReadOnlyAssessment). */
export function ReceiptAssessmentCard({ event, canRevise }: { event: VendorReceiptEvent; canRevise: boolean }) {
  const router = useRouter()
  const assessment = event.assessment?.status === 'completed' ? event.assessment : null
  const saved = assessment ? answersOf(assessment) : null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ReceiptAssessmentAnswers>(saved ?? EMPTY_ASSESSMENT_ANSWERS)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const issues = assessmentIssues(draft)
  const conditional = saved ? hasAbnormalAnswer(saved) : false

  function save() {
    if (!assessment) return
    setAttempted(true)
    if (issues.length) return
    setError(null)
    startTransition(async () => {
      try {
        await api(`/api/receiving/assessments/${assessment.id}`, { method: 'PATCH', body: JSON.stringify(normalizeAssessmentAnswers(draft)) })
        setEditing(false); setAttempted(false); router.refresh()
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'แก้ไขผลตรวจรับไม่สำเร็จ') }
    })
  }

  return <article className="space-y-3 rounded-lg border border-[#d3e1e3] p-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div><strong className="mono">{event.eventNumber ?? '—'}</strong><span className="text-sm text-[#6a838c]"> · Invoice {event.invoiceNumber ?? '—'} · รับเมื่อ {formatThaiDateTime(event.receivedAt)}</span></div>
      {saved ? <StatusBadge tone={conditional ? 'warning' : 'accepted'} label={conditional ? 'รับสินค้าแบบมีเงื่อนไข' : 'รับสินค้า'} /> : <StatusBadge tone="not_evaluated" label="รอประเมิน" />}
    </header>
    {!saved || !assessment ? <p className="text-sm text-[#81979c]">ยังไม่มีผลตรวจรับ</p> : editing ? <div className="space-y-4">
      <AssessmentFields answers={draft} onChange={(next) => setDraft((current) => ({ ...current, ...next }))} invalid={(field) => attempted && issues.some((issue) => issue.field === field)} />
      {attempted && issues.length ? <Notice tone="danger">{issues[0].message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={() => { setEditing(false); setDraft(saved); setAttempted(false); setError(null) }}>ยกเลิก</Button><Button type="button" disabled={pending} onClick={save}>{pending ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}</Button></div>
    </div> : <>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{lines(saved).map((line) => <div key={line.label} className="flex justify-between gap-3 border-b border-[#e5eeee] py-1"><dt className="text-[#6a838c]">{line.label}</dt><dd className={line.exception ? 'font-bold text-[#8a5a00]' : ''}>{line.value}</dd></div>)}</dl>
      {saved.reasonCodes.length > 0 && <p className="text-sm"><strong>เหตุผลที่ยอมรับสินค้า:</strong> {saved.reasonCodes.map((code) => code === 'other' && saved.otherReasonDetail ? `${REASON_LABELS[code]}: ${saved.otherReasonDetail}` : REASON_LABELS[code]).join(' · ')}</p>}
      {saved.note && <p className="break-words text-sm"><strong>หมายเหตุ:</strong> {saved.note}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#81979c]">{event.revisionCount ? `แก้ไขแล้ว ${event.revisionCount} ครั้ง · ล่าสุด ${formatThaiDateTime(event.lastRevisionAt)}` : `ตรวจรับเมื่อ ${formatThaiDateTime(assessment.assessedAt)}`}</p>
        {canRevise && <Button type="button" variant="secondary" onClick={() => { setDraft(saved); setEditing(true) }}>แก้ไขผลตรวจรับ</Button>}
      </div>
    </>}
  </article>
}
