'use client'

import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import type { VendorEvaluationApproval, VendorEvaluationRole, VendorEvaluationWorkspace } from '@/lib/vendors/evaluation-types'
import { VENDOR_EVALUATION_ROLES } from '@/lib/vendors/evaluation-types'
import { api, Button, Card, Field, Notice, Textarea } from '@/components/ui'
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad'
import { VendorMetricsPanel } from '@/components/vendors/vendor-metrics-panel'

const roleLabels: Record<VendorEvaluationRole, string> = { evaluator: 'Evaluator', reviewer: 'Reviewer', approver: 'Approver' }

export function VendorEvaluationView({ initialEvaluation }: { initialEvaluation: VendorEvaluationWorkspace }) {
  const [workspace, setWorkspace] = useState(initialEvaluation)
  const [judgment, setJudgment] = useState(initialEvaluation.evaluation.judgment)
  const [busy, setBusy] = useState(false)
  const [signingRole, setSigningRole] = useState<VendorEvaluationRole | null>(null)
  const [signerName, setSignerName] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const pad = useRef<SignaturePadHandle | null>(null)
  const onPadReady = useCallback((handle: SignaturePadHandle) => { pad.current = handle }, [])

  function beginSigning(role: VendorEvaluationRole) {
    setSigningRole(role)
    setSignerName(workspace.assignments.find((item) => item.approvalRole === role)?.userName ?? '')
    pad.current = null
  }

  async function regenerate() {
    setBusy(true)
    try {
      const result = await api<{ evaluation: VendorEvaluationWorkspace }>(`/api/vendor-evaluations/${workspace.evaluation.id}`, { method: 'PATCH', body: JSON.stringify({ judgment }) })
      setWorkspace(result.evaluation)
      setNotice({ tone: 'success', text: `บันทึกร่าง revision ${result.evaluation.documentState.revision} แล้ว · ลายเซ็น revision เดิมยังคงเป็น audit` })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกร่างไม่สำเร็จ' })
    } finally { setBusy(false) }
  }

  async function sign(role: VendorEvaluationRole) {
    if (!signerName.trim()) return setNotice({ tone: 'danger', text: 'กรุณากรอกชื่อผู้ลงนาม' })
    if (pad.current?.isEmpty() !== false) return setNotice({ tone: 'danger', text: 'กรุณาวาดลายเซ็นก่อนลงนาม' })
    const signature = await pad.current?.toFile()
    if (!signature) return setNotice({ tone: 'danger', text: 'อ่านลายเซ็นไม่สำเร็จ' })
    const form = new FormData()
    form.set('approvalRole', role)
    form.set('signerName', signerName.trim())
    form.set('signature', signature)
    setBusy(true)
    try {
      const response = await fetch(`/api/vendor-evaluations/${workspace.evaluation.id}/approvals`, { method: 'POST', body: form })
      const payload = await response.json().catch(() => ({})) as { evaluation?: VendorEvaluationWorkspace; error?: string }
      if (!response.ok || !payload.evaluation) throw new Error(payload.error ?? 'ลงนามไม่สำเร็จ')
      setWorkspace(payload.evaluation)
      setSigningRole(null)
      setSignerName('')
      pad.current = null
      setNotice({ tone: 'success', text: `ลงนาม ${roleLabels[role]} แล้ว` })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ลงนามไม่สำเร็จ' })
    } finally { setBusy(false) }
  }

  async function revoke(approval: VendorEvaluationApproval) {
    setBusy(true)
    try {
      const result = await api<{ evaluation: VendorEvaluationWorkspace }>(`/api/vendor-evaluations/${workspace.evaluation.id}/approvals`, { method: 'DELETE', body: JSON.stringify({ approvalRole: approval.approvalRole }) })
      setWorkspace(result.evaluation)
      setNotice({ tone: 'success', text: 'ถอนลายเซ็นแล้ว' })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ถอนลายเซ็นไม่สำเร็จ' })
    } finally { setBusy(false) }
  }

  const currentApprovals = workspace.approvals.filter((approval) => approval.revision === workspace.documentState.revision)
  const previousApprovals = workspace.approvals.filter((approval) => approval.revision < workspace.documentState.revision)
  return (
    <main className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-bold tracking-[0.18em] text-[#0b7f76] uppercase">Annual Vendor Evaluation · Stock1</p><h1 className="mt-1 text-2xl font-bold text-[#173d50] sm:text-3xl">{workspace.vendor.code} · {workspace.vendor.name}</h1><p className="mt-1 text-sm text-[#6a838c]">{Number(workspace.evaluation.fiscalYear) + 543} · revision {workspace.documentState.revision}</p></div><div className="flex flex-wrap gap-2"><Link href={`/vendors/${workspace.vendor.id}?fiscalYear=${workspace.evaluation.fiscalYear}`} className="inline-flex min-h-11 items-center rounded-md border border-[#c9dadd] bg-white px-3.5 py-2 text-sm font-semibold text-[#244854]">กลับ metrics</Link><Link href={`/vendors/evaluations/${workspace.evaluation.id}/report`} className="inline-flex min-h-11 items-center rounded-md bg-[#0b7f76] px-3.5 py-2 text-sm font-semibold text-white">พิมพ์ evaluation</Link></div></div>
      {notice ? <Notice tone={notice.tone === 'success' ? 'success' : 'danger'}>{notice.text}</Notice> : null}
      {!workspace.policy.isApproved ? <Notice tone="warning">ยังไม่ได้กำหนดสูตรคะแนน — รออนุมัติ P-13/P-14 · result จะคงเป็น null</Notice> : <Notice tone="info">มี policy row ที่อนุมัติแล้ว แต่การคำนวณผลจะอ่านจาก policy ที่อนุมัติเท่านั้น</Notice>}

      <section><div className="mb-3"><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Frozen evidence</p><h2 className="mt-1 text-xl font-bold text-[#173d50]">Metrics snapshot ของร่างฉบับนี้</h2><p className="mt-1 text-xs text-[#81979c]">snapshot (รวมผล Receipt Assessment, ข้อมูลจำนวนรับ และ issue พร้อมที่มา) ถูกตรึงตอนสร้าง/สร้าง revision ใหม่ ไม่เปลี่ยนตาม receipt ภายหลังโดยอัตโนมัติ · ไม่มีคะแนน น้ำหนัก หรือเกณฑ์ผ่าน/ไม่ผ่าน</p></div><VendorMetricsPanel metrics={workspace.evaluation.metricsSnapshot} /></section>

      <Card className="p-4"><div><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Judgment</p><h2 className="mt-1 text-xl font-bold text-[#173d50]">ข้อพิจารณาและแผนติดตาม</h2><p className="mt-1 text-xs text-[#81979c]">การบันทึกใหม่จะสร้าง revision ใหม่และเก็บลายเซ็นเดิมไว้เป็น audit</p></div><div className="mt-4 grid gap-3 md:grid-cols-2"><Field label="สรุปการประเมิน"><Textarea rows={4} value={judgment.summary} onChange={(event) => setJudgment({ ...judgment, summary: event.target.value })} /></Field><Field label="จุดแข็ง"><Textarea rows={4} value={judgment.strengths} onChange={(event) => setJudgment({ ...judgment, strengths: event.target.value })} /></Field><Field label="ความเสี่ยง / ประเด็นต้องติดตาม"><Textarea rows={4} value={judgment.risks} onChange={(event) => setJudgment({ ...judgment, risks: event.target.value })} /></Field><Field label="แผนการติดตาม"><Textarea rows={4} value={judgment.actions} onChange={(event) => setJudgment({ ...judgment, actions: event.target.value })} /></Field></div><Button type="button" className="mt-3" disabled={busy || !judgment.summary.trim()} onClick={() => void regenerate()}>บันทึกร่างใหม่ / สร้าง revision</Button></Card>

      <Card className="p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Signatures</p><h2 className="mt-1 text-xl font-bold text-[#173d50]">ทบทวนและลงนาม</h2><p className="mt-1 text-xs text-[#81979c]">P-15 ยังไม่กำหนดผู้รับผิดชอบตายตัว · assignment ที่มีจะถูกบังคับใช้ server-side</p></div><span className={`rounded-full border px-2 py-1 text-xs font-bold ${workspace.documentState.status === 'approved' ? 'border-[#c6e2ca] bg-[#f1faf3] text-[#2f7d44]' : 'border-[#eed4a6] bg-[#fff9ed] text-[#a9700f]'}`}>{workspace.documentState.status === 'approved' ? 'ลงนามครบ' : 'รอลงนาม'}</span></div><div className="mt-4 grid gap-3 md:grid-cols-3">{VENDOR_EVALUATION_ROLES.map((role) => { const approval = currentApprovals.find((item) => item.approvalRole === role); const assignment = workspace.assignments.find((item) => item.approvalRole === role); const signed = Boolean(approval?.signatureAttachmentId); return <div key={role} className="rounded-lg border border-[#e1eaeb] bg-[#fbfdfd] p-3"><p className="font-bold text-[#315763]">{roleLabels[role]}</p><p className="mt-1 text-xs text-[#81979c]">{assignment ? `มอบหมาย: ${assignment.userName}` : 'ยังไม่มี assignment'}</p>{signed ? <><div className="mt-3 flex h-20 items-center justify-center rounded-md border border-dashed border-[#b9d6d0] bg-white p-2"><img src={`/api/attachments/${approval!.signatureAttachmentId}`} alt={`ลายเซ็น ${roleLabels[role]}`} className="max-h-full max-w-full object-contain" /></div><p className="mt-2 text-sm font-semibold text-[#315763]">{approval!.signerName ?? approval!.approvedByName}</p><p className="mt-1 text-[11px] text-[#81979c]">{new Date(approval!.approvedAt).toLocaleString('th-TH')}</p>{approval!.approvedBy && <Button type="button" variant="ghost" className="mt-2 min-h-9 px-2 py-1 text-xs" disabled={busy} onClick={() => void revoke(approval!)}>ถอนลายเซ็น</Button>}</> : <>{signingRole !== role ? <Button type="button" className="mt-4 w-full min-h-10 px-2 py-1 text-xs" disabled={busy} onClick={() => beginSigning(role)}>ลงนาม</Button> : <div className="mt-3 space-y-2"><Field label="ชื่อผู้ลงนาม"><input className="min-h-10 w-full rounded-md border border-[#cfdee0] px-2 text-sm" value={signerName} onChange={(event) => setSignerName(event.target.value)} /></Field><SignaturePad label={`ลายเซ็น ${roleLabels[role]}`} onReady={onPadReady} /><div className="flex gap-2"><Button type="button" className="min-h-9 px-2 py-1 text-xs" disabled={busy} onClick={() => void sign(role)}>บันทึกลายเซ็น</Button><Button type="button" variant="secondary" className="min-h-9 px-2 py-1 text-xs" disabled={busy} onClick={() => { setSigningRole(null); setSignerName('') }}>ยกเลิก</Button></div></div>}</>}</div> })}</div>{previousApprovals.length ? <p className="mt-3 rounded-md border border-[#d8e4e5] bg-[#f7fafa] px-3 py-2 text-xs text-[#58747d]">มีลายเซ็นจาก revision ก่อนหน้า {previousApprovals.length} รายการ · เก็บไว้เพื่อ audit และไม่ถูกนับเป็นลายเซ็นของ revision ปัจจุบัน</p> : null}</Card>

      <Card className="p-4"><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Significant events</p><h2 className="mt-1 text-xl font-bold text-[#173d50]">เหตุการณ์สำคัญแยกจากผลการประเมิน</h2>{workspace.evaluation.significantEventsSnapshot.length ? <div className="mt-3 space-y-2">{workspace.evaluation.significantEventsSnapshot.map((event) => <div key={event.id} className="rounded-md border border-[#e1eaeb] px-3 py-2 text-sm"><div className="flex justify-between gap-2"><span className="font-semibold text-[#315763]">{event.eventType}</span><span className="text-xs text-[#a9700f]">{event.severity}</span></div><p className="mt-1 text-xs text-[#58747d]">{event.description}</p></div>)}</div> : <p className="mt-3 text-sm text-[#81979c]">ไม่มี significant event ที่ถูก snapshot ใน revision นี้</p>}</Card>
      <Card className="p-4"><h2 className="text-xl font-bold text-[#173d50]">ผลการประเมิน</h2><p className="mt-2 rounded-md border border-[#eed4a6] bg-[#fff9ed] px-3 py-2 text-sm font-semibold text-[#8b5c0b]">{workspace.evaluation.resultLabel ?? 'ยังไม่ได้กำหนดสูตรคะแนน — รออนุมัติ'}</p><p className="mt-2 text-xs text-[#81979c]">result: {workspace.evaluation.result == null ? 'null' : workspace.evaluation.result}</p></Card>
    </main>
  )
}
