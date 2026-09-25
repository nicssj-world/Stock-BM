'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, RefreshCw } from 'lucide-react'
import { api, Button, Card, Field, Notice, Select, Textarea } from '@/components/ui'
import { formatThaiDate, formatThaiDateTime } from '@/lib/bm/thai-date'
import { RESULT_LABELS, criterionLabel, draftInputError, finalizeReadiness, type AnnualRevision, type DraftInput, type Signer } from '@/lib/vendors/evaluation'

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 })
const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'N/A' : `${number.format(Number(v))}%`)

// Layout and behaviour follow LABCBH-Stock AnnualEvaluationEditor: evidence, four judgment fields, three signers, refresh / save / finalize.
export function AnnualEvaluationEditor({ revision, signers, canManage }: { revision: AnnualRevision; signers: Signer[]; canManage: boolean }) {
  const router = useRouter()
  const isFinal = revision.status === 'final'
  const frozen = revision.frozen
  const evidence = frozen?.evidence ?? revision.evidence
  const editable = canManage && !isFinal
  const policyApproved = revision.policyStatus === 'approved'
  const vendorId = revision.vendorId
  const [draft, setDraft] = useState<DraftInput>({
    summary: revision.summary ?? '', strengths: revision.strengths ?? '', risksConcerns: revision.risksConcerns ?? '', recommendations: revision.recommendations ?? '',
    evaluatorId: revision.evaluatorId ?? '', reviewerId: revision.reviewerId ?? '', approverId: revision.approverId ?? '',
  })
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const set = (key: keyof DraftInput) => (value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const endpoint = `/api/vendors/${vendorId}/evaluations/${revision.id}`

  function run(work: () => Promise<unknown>, done: string) {
    setError(null); setMessage(null)
    startTransition(async () => {
      try { await work(); setMessage(done); router.refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'ทำรายการไม่สำเร็จ'); setConfirming(false) }
    })
  }
  const patch = (body: object) => api<{ reportNumber?: string }>(endpoint, { method: 'PATCH', body: JSON.stringify(body) })
  const guarded = (fn: () => void) => { const bad = draftInputError(draft); if (bad) { setError(bad); setConfirming(false); return } fn() }
  const save = () => guarded(() => run(() => patch({ op: 'save', draft }), 'บันทึกฉบับร่างแล้ว'))
  const refresh = () => run(() => patch({ op: 'refresh' }), 'รีเฟรชหลักฐานแล้ว · ตรวจตัวเลขอีกครั้งก่อนสิ้นสุดรายงาน')
  const finalize = () => guarded(() => {
    setError(null); setMessage(null)
    startTransition(async () => {
      try { const result = await patch({ op: 'finalize', draft }); setConfirming(false); setMessage(`สิ้นสุดรายงานแล้ว · เลขที่ ${result.reportNumber}`); router.refresh() }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'สิ้นสุดรายงานไม่สำเร็จ'); setConfirming(false) }
    })
  })
  const newRevision = () => run(async () => {
    const created = await api<{ revisionId: string }>(`/api/vendors/${vendorId}/evaluations`, { method: 'POST', body: JSON.stringify({ fiscalYear: revision.fiscalYear }) })
    router.push(`/vendors/${vendorId}/evaluations/${created.revisionId}`)
  }, 'สร้างฉบับร่างใหม่แล้ว')

  const readiness = finalizeReadiness({ summary: draft.summary.trim() || null, strengths: draft.strengths.trim() || null, risksConcerns: draft.risksConcerns.trim() || null, recommendations: draft.recommendations.trim() || null,
    evaluatorId: draft.evaluatorId || null, reviewerId: draft.reviewerId || null, approverId: draft.approverId || null }, policyApproved)
  const missingSignature = ([['ผู้ประเมิน', draft.evaluatorId], ['ผู้ทบทวน', draft.reviewerId], ['ผู้อนุมัติ', draft.approverId]] as const).filter(([, id]) => id && signers.find((s) => s.id === id && !s.hasSignature)).map(([role]) => role)

  return <div className="space-y-6">
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">ปีงบประมาณ {revision.fiscalYear} · ฉบับที่ {revision.revisionNumber}</p><h2 className="text-xl font-extrabold text-[#173d50]">{isFinal ? `สิ้นสุดแล้ว · ${revision.reportNumber}` : 'ฉบับร่าง'}</h2></div><span className="rounded-full border border-[#c9dadd] px-2 py-0.5 text-xs font-bold">{isFinal ? 'Final' : 'Draft'}</span></div>
      <p className="text-sm text-[#6a838c]">{isFinal ? `ตรึงข้อมูลเมื่อ ${formatThaiDateTime(revision.finalizedAt)} · นโยบาย ${revision.policyVersion}` : `นโยบายที่ใช้: ${revision.policyVersion} · หลักฐานเมื่อ ${formatThaiDateTime(evidence.capturedAt)}`}</p>
      {!isFinal && !policyApproved && <Notice tone="warning">นโยบาย {revision.policyVersion} ยังเป็นข้อเสนอ · บันทึกฉบับร่างได้ แต่ยังสิ้นสุดรายงานและแสดงคะแนนอย่างเป็นทางการไม่ได้จนกว่าผู้ดูแลระบบจะอนุมัตินโยบาย</Notice>}
      {isFinal && frozen && <div className={`rounded-lg border p-3 ${frozen.result === 'fail' ? 'border-[#e6c987] bg-[#fffaf0]' : 'border-[#b7dcc6] bg-[#eef8f2]'}`} role="status"><span className="block text-xs text-[#6a838c]">คะแนนถ่วงน้ำหนัก (เกณฑ์ผ่าน {pct(frozen.policy.passThreshold)})</span><strong className="text-3xl">{number.format(frozen.score)} / 100 · {RESULT_LABELS[frozen.result]}</strong></div>}
      {isFinal && <div className="flex flex-wrap gap-2"><a className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#0b7f76] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#096b64]" href={`/api/vendors/${vendorId}/evaluations/${revision.id}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="size-4" aria-hidden />ดาวน์โหลดรายงาน PDF</a>{canManage && <Button type="button" variant="secondary" disabled={pending} onClick={newRevision}>สร้างฉบับร่างใหม่ (แก้ไขรายงาน)</Button>}</div>}
    </Card>

    <Card className="overflow-hidden">
      <div className="space-y-1 px-5 py-4"><h2 className="font-bold text-[#173d50]">หลักฐาน</h2>
        <p className="text-sm text-[#6a838c]">ช่วงข้อมูล {formatThaiDate(evidence.coverage.startDate)} – {formatThaiDate(evidence.coverage.endDate)} · ตรวจรับแล้ว {evidence.coverage.completed} · ค้างประเมิน {evidence.coverage.pending} · ความครอบคลุม {pct(evidence.coverage.percentage)}</p></div>
      <div className="relative overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-[#f1f6f6] text-xs text-[#58747d]"><tr><th className="p-2 pl-5">เกณฑ์</th><th className="p-2">หลักฐาน (ตัวตั้ง/ตัวหาร)</th><th className="p-2">ผล</th>{frozen && <><th className="p-2">น้ำหนักที่ใช้</th><th className="p-2">คะแนนถ่วงน้ำหนัก</th></>}</tr></thead>
        <tbody>{frozen
          ? frozen.criteria.map((c) => <tr key={c.criterionCode} className="border-t border-[#e5eeee]"><th scope="row" className="p-2 pl-5 font-semibold">{criterionLabel(c.criterionCode, c.label)}</th><td className="p-2 tabular-nums">{c.applicable ? `${c.numerator}/${c.denominator}` : 'N/A'}</td><td className="p-2 font-bold tabular-nums">{pct(c.percentage)}</td><td className="p-2 tabular-nums">{pct(c.effectiveWeight)}</td><td className="p-2 tabular-nums">{c.weightedScore === null ? '—' : number.format(c.weightedScore)}</td></tr>)
          : evidence.criteria.map((c) => <tr key={c.criterionCode} className="border-t border-[#e5eeee]"><th scope="row" className="p-2 pl-5 font-semibold">{criterionLabel(c.criterionCode)}</th><td className="p-2 tabular-nums">{c.applicable ? `${c.numerator}/${c.denominator}` : 'N/A'}</td><td className="p-2 font-bold tabular-nums">{pct(c.percentage)}</td></tr>)}</tbody></table></div>
      <div className="space-y-3 p-5">
        {evidence.receipts && evidence.receipts.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center font-semibold">รายการรับของ ({evidence.receipts.length})</summary><ul className="mt-2 space-y-1 text-sm">{evidence.receipts.map((r, i) => <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-[#e5eeee] py-1"><span className="mono">{r.eventNumber}</span><span>Invoice {r.invoiceNumber ?? '—'} · {formatThaiDate(r.receivedDate)}</span><span className="text-[#81979c]">{r.assessmentState === 'completed' ? 'ตรวจรับแล้ว' : r.assessmentState === 'pending' ? 'ค้างประเมิน' : 'ไม่ต้องประเมิน'}</span></li>)}</ul></details>}
        {evidence.issues && evidence.issues.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center font-semibold">ปัญหาผู้ขาย ({evidence.issues.length})</summary><ul className="mt-2 space-y-1 text-sm">{evidence.issues.map((i) => <li key={i.id} className="border-b border-[#e5eeee] py-1">{i.description} <span className="text-[#81979c]">· {i.status === 'resolved' ? 'แก้ไขแล้ว' : 'รอดำเนินการ'}</span></li>)}</ul></details>}
      </div>
    </Card>

    <Card className="space-y-4 p-5"><h2 className="font-bold text-[#173d50]">ผลการประเมินและข้อเสนอแนะ</h2>
      {editable ? <div className="space-y-4">
        {([['summary', 'สรุปผลการประเมิน'], ['strengths', 'จุดแข็ง'], ['risksConcerns', 'ความเสี่ยง / ข้อกังวล'], ['recommendations', 'ข้อเสนอแนะ']] as const).map(([key, label]) => <div key={key} className="space-y-1"><Field label={label}><Textarea rows={4} maxLength={4000} value={draft[key]} onChange={(e) => set(key)(e.target.value)} aria-describedby={`ae-count-${key}`} /></Field><small id={`ae-count-${key}`} className="block text-right text-[#81979c]">{draft[key].length}/4000</small></div>)}
      </div> : <dl className="space-y-3 text-sm">{([['สรุปผลการประเมิน', revision.summary], ['จุดแข็ง', revision.strengths], ['ความเสี่ยง / ข้อกังวล', revision.risksConcerns], ['ข้อเสนอแนะ', revision.recommendations]] as const).map(([label, value]) => <div key={label}><dt className="text-xs text-[#81979c]">{label}</dt><dd className="whitespace-pre-wrap break-words">{value || '—'}</dd></div>)}</dl>}
    </Card>

    <Card className="space-y-4 p-5"><h2 className="font-bold text-[#173d50]">ผู้ลงนาม</h2>
      {editable ? <div className="grid gap-4 sm:grid-cols-3">{([['evaluatorId', 'ผู้ประเมิน'], ['reviewerId', 'ผู้ทบทวน'], ['approverId', 'ผู้อนุมัติ']] as const).map(([key, label]) => <Field key={key} label={label}><Select aria-label={label} value={draft[key]} onChange={(e) => set(key)(e.target.value)}><option value="">เลือกผู้ลงนาม</option>{signers.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.position}{s.hasSignature ? '' : ' (ยังไม่มีลายเซ็น)'}</option>)}</Select></Field>)}</div>
        : <dl className="grid gap-4 text-sm sm:grid-cols-3">{([['ผู้ประเมิน', revision.evaluatorName, revision.evaluatorPosition], ['ผู้ทบทวน', revision.reviewerName, revision.reviewerPosition], ['ผู้อนุมัติ', revision.approverName, revision.approverPosition]] as const).map(([role, name, position]) => <div key={role}><dt className="text-xs text-[#81979c]">{role}</dt><dd className="font-semibold">{name ?? '—'}</dd><dd className="text-[#6a838c]">{position}</dd></div>)}</dl>}
      {editable && signers.length < 3 && <Notice tone="info">มีผู้ที่ระบุตำแหน่งแล้ว {signers.length} คน · ผู้ลงนามต้องมีตำแหน่ง (ระบุที่ <Link href="/vendors/my-signature" className="underline">ตำแหน่งและลายเซ็นของฉัน</Link> หรือแอดมินระบุที่แท็บ users) และมีลายเซ็นก่อนสิ้นสุดรายงาน</Notice>}
      {editable && missingSignature.length > 0 && <Notice tone="warning">ยังไม่มีลายเซ็น: {missingSignature.join(', ')} · ให้เจ้าตัวเซ็นที่ “ตำแหน่งและลายเซ็นของฉัน” ก่อนสิ้นสุดรายงาน</Notice>}
    </Card>

    {editable && <Card className="space-y-3 p-5">
      {readiness.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm" aria-label="สิ่งที่ยังต้องทำก่อนสิ้นสุดรายงาน">{readiness.map((r) => <li key={r}>{r}</li>)}</ul>}
      {message && <Notice tone="success">{message}</Notice>}{error && <Notice tone="danger">{error}</Notice>}
      {confirming ? <div className="space-y-3" role="group" aria-label="ยืนยันสิ้นสุดรายงาน"><strong>ยืนยันสิ้นสุดรายงานประเมินผู้ขาย</strong><p className="text-sm text-[#6a838c]">ระบบจะบันทึกข้อความ ตรึงตัวเลขหลักฐาน คำนวณคะแนนตามนโยบาย {revision.policyVersion} คัดลอกลายเซ็นผู้ลงนามทั้ง 3 คน และออกเลขที่รายงาน หลังจากนี้แก้ไขฉบับนี้ไม่ได้ (แก้ได้โดยสร้างฉบับร่างใหม่)</p>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>ยกเลิก</Button><Button type="button" disabled={pending} onClick={finalize}>{pending ? 'กำลังสิ้นสุดรายงาน…' : 'ยืนยันสิ้นสุดรายงาน'}</Button></div></div>
        : <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={refresh}><RefreshCw className="size-4" aria-hidden />รีเฟรชหลักฐาน</Button><Button type="button" variant="secondary" disabled={pending} onClick={save}>บันทึกฉบับร่าง</Button><Button type="button" disabled={pending || readiness.length > 0} onClick={() => setConfirming(true)}>สิ้นสุดรายงาน…</Button></div>}
    </Card>}
    {!editable && (message || error) && <div className="space-y-2">{message && <Notice tone="success">{message}</Notice>}{error && <Notice tone="danger">{error}</Notice>}</div>}
  </div>
}
