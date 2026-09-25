'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { api, Button, Card, Field, Input, Notice, Textarea } from '@/components/ui'
import { formatThaiDate, formatThaiDateTime } from '@/lib/bm/thai-date'
import { POLICY_STATUS_LABELS, VENDOR_EVALUATION_CRITERIA, VENDOR_EVALUATION_CRITERION_LABELS, criterionLabel, policyProposalError, type EvaluationPolicy, type PolicyProposalInput } from '@/lib/vendors/evaluation'

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 })
const percent = (value: number | null) => (value === null ? 'ยังไม่กำหนด' : `${number.format(value)}%`)
const effectiveYears = (p: EvaluationPolicy) => p.effectiveToFiscalYear === null ? `${p.effectiveFromFiscalYear} เป็นต้นไป` : `${p.effectiveFromFiscalYear} – ${p.effectiveToFiscalYear}`

// Layout and copy follow LABCBH-Stock VendorEvaluationPolicyPanel: a proposal is a form (Admin only), everything else is a record.
export function VendorPolicyPanel({ policies, canManage }: { policies: EvaluationPolicy[]; canManage: boolean }) {
  const [creating, setCreating] = useState(false)
  const proposal = policies.find((p) => p.status === 'proposed')
  const policy = proposal ?? policies[0]
  if (!policy) return <Notice tone="danger">ไม่พบนโยบายเริ่มต้น กรุณาตรวจว่า migration ล่าสุดถูกนำไปใช้แล้ว</Notice>
  const others = policies.filter((p) => p.id !== policy.id)
  // A new QP version starts from the newest approved policy: same weights, the year after it ends, no version name yet.
  const latest = policies.filter((p) => p.status === 'approved').sort((a, b) => b.effectiveFromFiscalYear - a.effectiveFromFiscalYear)[0] ?? policy
  const template: EvaluationPolicy = { ...latest, id: '', version: '', status: 'proposed', effectiveFromFiscalYear: (latest.effectiveToFiscalYear ?? latest.effectiveFromFiscalYear) + 1, effectiveToFiscalYear: null, note: '', approvedAt: null, approvedByName: null }
  return <div className="space-y-6">
    {canManage && proposal ? <PolicyProposalForm key={proposal.id} policy={proposal} onApproved={() => setCreating(false)} />
      : canManage && creating ? <PolicyProposalForm key="new" policy={template} onCancel={() => setCreating(false)} onApproved={() => setCreating(false)} />
      : <><PolicySummary policy={policy} />{canManage && <div><Button type="button" variant="secondary" onClick={() => setCreating(true)}>สร้างข้อเสนอนโยบายเวอร์ชันใหม่</Button><p className="mt-2 text-xs text-[#81979c]">เมื่ออนุมัติ นโยบายเวอร์ชันใหม่จะใช้ตั้งแต่ปีงบประมาณที่ระบุ และนโยบายที่ใช้อยู่จะสิ้นสุดที่ปีก่อนหน้า · รายงานที่สิ้นสุดแล้วยังอ้างนโยบายเดิม</p></div>}</>}
    {others.length > 0 && <Card className="overflow-hidden"><div className="px-4 py-3"><h2 className="font-bold text-[#173d50]">เวอร์ชันอื่น</h2></div>
      <div className="relative overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-[#f1f6f6] text-xs text-[#58747d]"><tr><th className="p-2 pl-4">เวอร์ชัน</th><th className="p-2">สถานะ</th><th className="p-2">ปีงบประมาณที่ใช้</th><th className="p-2">เกณฑ์ผ่าน</th><th className="p-2">อนุมัติเมื่อ</th></tr></thead>
        <tbody>{others.map((o) => <tr key={o.id} className="border-t border-[#e5eeee]"><td className="mono p-2 pl-4">{o.version}</td><td className="p-2">{POLICY_STATUS_LABELS[o.status]}</td><td className="p-2">{effectiveYears(o)}</td><td className="p-2">{percent(o.passThreshold)}</td><td className="p-2">{formatThaiDateTime(o.approvedAt)}</td></tr>)}</tbody></table></div></Card>}
  </div>
}

function PolicySummary({ policy }: { policy: EvaluationPolicy }) {
  const criteria = [...policy.criteria].sort((a, b) => a.displayOrder - b.displayOrder)
  const total = criteria.reduce((sum, c) => sum + (c.weight ?? 0), 0)
  return <>
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Policy version</p><h2 className="mono text-xl font-extrabold text-[#173d50]">{policy.version}</h2></div><span className="rounded-full border border-[#c9dadd] px-2 py-0.5 text-xs font-bold">{POLICY_STATUS_LABELS[policy.status]}</span></div>
      {policy.status === 'approved' && <Notice tone="success"><span className="flex items-start gap-2"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /><span>อนุมัติโดย <strong>{policy.approvedByName ?? 'ไม่ทราบผู้อนุมัติ'}</strong>{policy.approvedAt && <> เมื่อ {formatThaiDateTime(policy.approvedAt)}</>} · ใช้คำนวณคะแนนรายงานประจำปีและแก้ไขไม่ได้</span></span></Notice>}
      {policy.status === 'retired' && <Notice tone="info">เลิกใช้แล้ว ไม่ใช้กับรายงานใหม่ · เดิมอนุมัติโดย {policy.approvedByName ?? 'ไม่ทราบผู้อนุมัติ'}</Notice>}
      {policy.status === 'proposed' && <Notice tone="warning">ข้อเสนอนี้ยังไม่ได้รับอนุมัติ จึงยังใช้คำนวณคะแนนหรือผลผ่านไม่ได้ ผู้ดูแลระบบต้องตรวจตัวเลขและกดอนุมัติ</Notice>}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-[#81979c]">เกณฑ์ผ่าน</dt><dd className="text-xl font-bold">{percent(policy.passThreshold)}</dd><small className="text-[#81979c]">คะแนนถ่วงน้ำหนักขั้นต่ำ</small></div>
        <div><dt className="text-xs text-[#81979c]">ความครอบคลุมขั้นต่ำ</dt><dd className="text-xl font-bold">{percent(policy.minimumCoveragePercent)}</dd><small className="text-[#81979c]">ของรายการรับของที่ต้องประเมิน</small></div>
        <div><dt className="text-xs text-[#81979c]">ปีงบประมาณที่ใช้ (พ.ศ.)</dt><dd className="text-xl font-bold">{effectiveYears(policy)}</dd></div>
        <div><dt className="text-xs text-[#81979c]">เริ่มช่วงข้อมูล</dt><dd className="text-xl font-bold">{formatThaiDate(policy.coverageStartDate)}</dd></div>
      </dl>
    </Card>
    <Card className="overflow-hidden">
      <div className="flex justify-between gap-3 px-4 py-3"><h2 className="font-bold text-[#173d50]">น้ำหนักเกณฑ์</h2><span className="text-sm text-[#81979c]">{criteria.length} เกณฑ์ · รวม {number.format(total)}%</span></div>
      <div className="relative overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-[#f1f6f6] text-xs text-[#58747d]"><tr><th className="p-2 pl-4">ลำดับ</th><th className="p-2">เกณฑ์</th><th className="p-2">น้ำหนัก</th><th className="p-2 pr-4"><span className="sr-only">สัดส่วน</span></th></tr></thead>
        <tbody>{criteria.map((c, i) => <tr key={c.criterionCode} className="border-t border-[#e5eeee]"><td className="p-2 pl-4">{i + 1}</td><th scope="row" className="p-2 font-semibold">{criterionLabel(c.criterionCode, c.label)}</th><td className="p-2 font-bold tabular-nums">{c.weight === null ? '—' : `${number.format(c.weight)}%`}</td><td className="w-40 p-2 pr-4">{c.weight !== null && <progress className="w-full" max={100} value={c.weight} aria-hidden />}</td></tr>)}</tbody>
        <tfoot><tr className="border-t border-[#d3e1e3]"><td className="p-2" /><th scope="row" className="p-2">รวม</th><td className="p-2 font-bold tabular-nums">{number.format(total)}%</td><td /></tr></tfoot></table></div>
    </Card>
    <Card className="space-y-3 p-5"><h2 className="font-bold text-[#173d50]">นิยามเกณฑ์</h2>
      <div className="space-y-3">{criteria.map((c) => <details key={c.criterionCode} className="rounded-lg border border-[#d3e1e3] p-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold">{criterionLabel(c.criterionCode, c.label)}</summary>
        <dl className="mt-2 space-y-2 text-sm"><div><dt className="text-xs text-[#81979c]">หลักฐานที่ใช้</dt><dd>{c.evidenceDefinition}</dd></div><div><dt className="text-xs text-[#81979c]">วิธีคำนวณ</dt><dd>{c.calculationDefinition}</dd></div><div><dt className="text-xs text-[#81979c]">กรณี N/A</dt><dd>{c.naDefinition}</dd></div></dl></details>)}</div></Card>
    {policy.note?.trim() && <Card className="space-y-2 p-5"><h2 className="font-bold text-[#173d50]">{policy.status === 'proposed' ? 'หมายเหตุข้อเสนอ' : 'บันทึกตอนเสนอ'}</h2><blockquote className="whitespace-pre-wrap rounded-lg bg-[#f4f8fa] px-3 py-2 text-sm text-[#6a838c]">{policy.note}</blockquote></Card>}
  </>
}

function PolicyProposalForm({ policy, onCancel, onApproved }: { policy: EvaluationPolicy; onCancel?: () => void; onApproved: () => void }) {
  const router = useRouter()
  const [version, setVersion] = useState(policy.version)
  const [from, setFrom] = useState(String(policy.effectiveFromFiscalYear))
  const [to, setTo] = useState(policy.effectiveToFiscalYear ? String(policy.effectiveToFiscalYear) : '')
  const [threshold, setThreshold] = useState(policy.passThreshold === null ? '' : String(policy.passThreshold))
  const [coverage, setCoverage] = useState(policy.minimumCoveragePercent === null ? '' : String(policy.minimumCoveragePercent))
  const [start, setStart] = useState(policy.coverageStartDate)
  const [note, setNote] = useState(policy.note ?? '')
  const [weights, setWeights] = useState<Record<string, string>>(() => Object.fromEntries(VENDOR_EVALUATION_CRITERIA.map((code) => [code, policy.criteria.find((c) => c.criterionCode === code)?.weight?.toString() ?? ''])))
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const total = useMemo(() => VENDOR_EVALUATION_CRITERIA.reduce((sum, code) => sum + (Number(weights[code]) || 0), 0), [weights])
  const totalOk = Math.abs(total - 100) < 0.001
  const payload = (): PolicyProposalInput => ({
    policyId: policy.id || null, version, effectiveFromFiscalYear: from === '' ? Number.NaN : Number(from), effectiveToFiscalYear: to ? Number(to) : null,
    passThreshold: threshold === '' ? Number.NaN : Number(threshold), minimumCoveragePercent: coverage === '' ? Number.NaN : Number(coverage), coverageStartDate: start, note,
    criteria: VENDOR_EVALUATION_CRITERIA.map((criterionCode) => ({ criterionCode, weight: weights[criterionCode] === '' ? Number.NaN : Number(weights[criterionCode]) })),
  })
  const post = (body: object) => api<{ policyId?: string }>('/api/vendors/evaluation-policy', { method: 'POST', body: JSON.stringify(body) })

  function save(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null)
    const invalid = policyProposalError(payload())
    if (invalid) { setError(invalid); return }
    startTransition(async () => {
      try { await post({ action: 'save', proposal: payload() }); setMessage('บันทึกข้อเสนอนโยบายแล้ว'); router.refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'บันทึกนโยบายไม่สำเร็จ') }
    })
  }
  function approve() {
    setError(null); setMessage(null)
    const invalid = policyProposalError(payload())
    if (invalid) { setError(invalid); setConfirming(false); return }
    startTransition(async () => {
      try {
        const saved = await post({ action: 'save', proposal: payload() })
        await post({ action: 'approve', policyId: saved.policyId })
        setConfirming(false); onApproved(); router.refresh()
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'อนุมัตินโยบายไม่สำเร็จ'); setConfirming(false) }
    })
  }

  return <form className="space-y-6" onSubmit={save}>
    <Notice tone="warning"><strong>ข้อเสนอ (รออนุมัติ)</strong> — ค่าน้ำหนักและเกณฑ์ผ่านยังไม่ใช่นโยบายอย่างเป็นทางการ และยังใช้สร้างคะแนนไม่ได้</Notice>
    <Card className="space-y-4 p-5"><h2 className="font-bold text-[#173d50]">ข้อมูลนโยบาย</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="เวอร์ชัน"><Input className="mono" value={version} onChange={(e) => setVersion(e.target.value)} /></Field>
        <Field label="ปีงบประมาณที่เริ่มใช้ (พ.ศ.)"><Input type="number" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="ปีสิ้นสุด (ไม่บังคับ)"><Input type="number" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="เกณฑ์ผ่าน (%)"><Input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="ยังไม่กำหนด" /></Field>
        <Field label="ความครอบคลุมขั้นต่ำ (%)"><Input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder="ยังไม่กำหนด" /></Field>
        <Field label="เริ่มช่วงข้อมูล"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      </div>
      <Field label="หมายเหตุข้อเสนอ" hint="บันทึกนี้จะเก็บไว้เป็นประวัติของข้อเสนอหลังอนุมัติ"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field></Card>
    <Card className="space-y-4 p-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold text-[#173d50]">น้ำหนักเกณฑ์</h2><strong className={totalOk ? 'text-[#2f855a]' : 'text-[#a3263a]'} aria-live="polite">รวม {total.toFixed(2)}%{totalOk ? '' : ' · ต้องเท่ากับ 100%'}</strong></div>
      <div className="grid gap-3 sm:grid-cols-2">{VENDOR_EVALUATION_CRITERIA.map((code, index) => <label key={code} className="flex items-center justify-between gap-3 rounded-lg border border-[#d3e1e3] p-3"><span><span className="mr-2 text-xs text-[#81979c]">{index + 1}</span>{VENDOR_EVALUATION_CRITERION_LABELS[code]}</span>
        <span className="flex items-center gap-1"><Input className="!w-24 text-right" type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={weights[code]} onChange={(e) => setWeights((w) => ({ ...w, [code]: e.target.value }))} placeholder="—" aria-label={`น้ำหนัก ${VENDOR_EVALUATION_CRITERION_LABELS[code]}`} /><span aria-hidden>%</span></span></label>)}</div></Card>
    {error && <Notice tone="danger">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}
    {confirming ? <Card className="space-y-3 p-5" ><strong>ยืนยันอนุมัตินโยบาย {version}</strong><p className="text-sm text-[#6a838c]">หลังอนุมัติ เวอร์ชัน น้ำหนัก เกณฑ์ผ่าน และความครอบคลุมขั้นต่ำจะแก้ไขไม่ได้ และจะใช้คำนวณคะแนนรายงานประจำปีที่อ้างนโยบายนี้ · หากมีนโยบายอื่นที่อนุมัติแล้วและใช้ต่อเนื่องอยู่ ระบบจะให้นโยบายนั้นสิ้นสุดที่ปีก่อนปีเริ่มใช้ของเวอร์ชันนี้</p>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>ยกเลิก</Button><Button type="button" onClick={approve} disabled={pending || !totalOk}>{pending ? 'กำลังอนุมัติ…' : 'ยืนยันบันทึกและอนุมัติ'}</Button></div></Card>
      : <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary" disabled={pending}>{pending ? 'กำลังบันทึก…' : 'บันทึกข้อเสนอ'}</Button><Button type="button" onClick={() => setConfirming(true)} disabled={pending || !totalOk}>บันทึกและอนุมัติ…</Button>{onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>ยกเลิก</Button>}</div>}
  </form>
}
