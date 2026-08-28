/* eslint-disable @next/next/no-img-element -- signature preview uses the authenticated attachment route directly. */
'use client'

import { useCallback, useRef, useState } from 'react'
import { CheckCircle2, LoaderCircle, PenLine, X } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type {
  EqaApprovalRole, EqaAssignedApprovalRole, EqaDocumentApproval, EqaDocumentState, EqaDocumentType, EqaWorkspace,
} from '@/lib/eqa/types'
import { EQA_APPROVAL_ROLE_LABELS } from '@/lib/eqa/types'
import type { EqaReadinessIssue, EqaReadinessTarget } from '@/lib/eqa/rules'
import { formatDateTime } from '@/lib/bm/rules'
import { api, Button, Field, Input, Select, StatusBadge, type StatusTone } from '@/components/ui'
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad'

export type Tab = 'plans' | 'rounds' | 'corrective' | 'reports' | 'manage'
export const TAB_KEYS: Tab[] = ['plans', 'rounds', 'corrective', 'reports', 'manage']
export type EqaFocus = { roundId?: string; open?: 'receipt' | 'result' | 'summary'; actionId?: string }
export type NoticeState = { tone: 'success' | 'danger'; text: string } | null
export type Update = (text: string, data: EqaWorkspace) => void

export const APPROVAL_ROLES: EqaAssignedApprovalRole[] = ['technical-manager', 'quality-manager', 'section-head', 'department-head']
export const STATUS_TONE: Record<string, StatusTone> = { scheduled: 'neutral', received: 'warning', submitted: 'accepted', evaluated: 'accepted', closed: 'neutral' }
export const OUTCOME_TONE: Record<string, StatusTone> = { acceptable: 'accepted', warning: 'warning', unacceptable: 'rejected', 'not-evaluated': 'neutral' }
export const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function UserSelect({ users, value, onChange, className }: { users: EqaWorkspace['users']; value: string; onChange: (value: string) => void; className?: string }) {
  return <Select className={className} value={value} onChange={(event) => onChange(event.target.value)}><option value="">—</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select>
}

const SIGNER_HELP: Record<EqaApprovalRole, string> = {
  analyst: 'ผู้ตรวจวิเคราะห์รับรองข้อมูลรับตัวอย่างและผลที่ส่ง',
  'technical-manager': 'ผู้จัดการวิชาการทบทวนความถูกต้องของเอกสาร',
  'quality-manager': 'ผู้จัดการคุณภาพรับรองเอกสารคุณภาพ',
  'section-head': 'หัวหน้างานรับรองเอกสารของหน่วยงาน',
  'department-head': 'หัวหน้ากลุ่มงานรับรองเอกสาร',
}

function roleName(role: EqaApprovalRole) {
  return EQA_APPROVAL_ROLE_LABELS[role]
}

export function ApprovalPanel({ actor, data, type, entityId, state, approvals, readiness, analystId, visibleRoles, lockedRoles, onNavigate, onOk, onErr }: {
  actor: BmActor; data: EqaWorkspace; type: EqaDocumentType; entityId: string; state: EqaDocumentState; approvals: EqaDocumentApproval[]; readiness: EqaReadinessIssue[]; analystId?: string | null; visibleRoles?: EqaApprovalRole[]; lockedRoles?: EqaApprovalRole[]; onNavigate?: (target: EqaReadinessTarget) => void; onOk: Update; onErr: (text: string) => void
}) {
  const allRoles: EqaApprovalRole[] = type === 'round-receipt' ? ['analyst', 'technical-manager'] : APPROVAL_ROLES
  const roles = visibleRoles ? allRoles.filter((role) => visibleRoles.includes(role)) : allRoles
  const [busyRole, setBusyRole] = useState<EqaApprovalRole | null>(null)
  const [signingRole, setSigningRole] = useState<EqaApprovalRole | null>(null)
  const [signerName, setSignerName] = useState('')
  const pad = useRef<SignaturePadHandle | null>(null)
  const onPadReady = useCallback((handle: SignaturePadHandle) => { pad.current = handle }, [])

  async function revoke(role: EqaApprovalRole) {
    setBusyRole(role)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/documents/${type}/${entityId}/approvals`, { method: 'DELETE', body: JSON.stringify({ approvalRole: role }) })
      onOk(`ถอนลายเซ็น${roleName(role)}แล้ว`, result.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ') } finally { setBusyRole(null) }
  }

  function canSign(role: EqaApprovalRole) {
    if (role === 'analyst') return actor.role === 'Admin' || analystId === actor.id
    const assignment = data.approverAssignments.find((item) => item.approvalRole === role)
    return actor.role === 'Admin' || !assignment || assignment.userId === actor.id
  }

  function startSigning(role: EqaApprovalRole, defaultName: string) {
    setSigningRole(role)
    setSignerName(defaultName)
    pad.current = null
  }

  function cancelSigning() {
    setSigningRole(null)
    setSignerName('')
    pad.current = null
  }

  async function sign(role: EqaApprovalRole) {
    if (!signerName.trim()) return onErr('กรุณากรอกชื่อ-นามสกุลผู้ลงนาม')
    if (pad.current?.isEmpty() !== false) return onErr('กรุณาวาดลายเซ็นก่อนลงนาม')
    const signature = await pad.current?.toFile()
    if (!signature) return onErr('อ่านลายเซ็นไม่สำเร็จ กรุณาเซ็นใหม่อีกครั้ง')
    const form = new FormData()
    form.set('approvalRole', role)
    form.set('signerName', signerName.trim())
    form.set('signature', signature)
    setBusyRole(role)
    try {
      const response = await fetch(`/api/eqa/documents/${type}/${entityId}/approvals`, { method: 'POST', body: form })
      const payload = await response.json().catch(() => ({})) as { eqa?: EqaWorkspace; error?: string }
      if (!response.ok || !payload.eqa) throw new Error(payload.error ?? 'ลงนามไม่สำเร็จ')
      cancelSigning()
      onOk(`ลงนาม${roleName(role)}แล้ว`, payload.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ลงนามไม่สำเร็จ') } finally { setBusyRole(null) }
  }

  const signedCount = roles.filter((role) => approvals.find((item) => item.approvalRole === role)?.signatureAttachmentId).length
  const pendingCount = roles.length - signedCount
  return (
    <div className="mt-3 rounded-xl border border-[#cfe1e0] bg-[#f7fbfa] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[#173d50]">ลงนามรับรองเอกสาร</p>
          <p className="mt-0.5 text-[11px] text-[#789097]">เอกสาร revision {state.revision} · ลงนามครบแล้วจึงถือว่าเอกสารสมบูรณ์</p>
        </div>
        <StatusBadge tone={state.status === 'approved' ? 'accepted' : 'warning'} label={state.status === 'approved' ? 'ลงนามครบ' : `รอลงนาม ${pendingCount} บทบาท`} />
      </div>
      {readiness.length ? (
        <div className="mt-3 rounded-lg border border-[#eed4a6] bg-[#fffaf0] p-3">
          <p className="text-xs font-bold text-[#8b5c0b]">ทำรายการให้ครบก่อนลงนาม ({readiness.length} รายการ)</p>
          <ul className="mt-1.5 list-disc pl-5 text-xs text-[#a9700f]">
          {readiness.map((issue) => (
            <li key={issue.message}>
              {issue.target && onNavigate ? (
                <button type="button" className="text-left underline decoration-dotted hover:text-[#8a5a08]" onClick={() => onNavigate(issue.target!)}>{issue.message}</button>
              ) : issue.message}
            </li>
          ))}
          </ul>
        </div>
      ) : <p className="mt-3 rounded-lg border border-[#c6e2ca] bg-[#f2faf3] px-3 py-2 text-xs font-semibold text-[#2f7d44]">ข้อมูลครบแล้ว สามารถลงนามรับรองตามบทบาทได้</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((role) => {
          const approval = approvals.find((item) => item.approvalRole === role)
          const assignee = role === 'analyst' ? (analystId ? data.users.find((user) => user.id === analystId) : undefined) : data.approverAssignments.find((assignment) => assignment.approvalRole === role)
          const assigneeName = assignee ? ('userName' in assignee ? assignee.userName : assignee.displayName) : ''
          const signed = Boolean(approval?.signatureAttachmentId)
          const legacyApproval = Boolean(approval && !signed)
          const canAct = canSign(role) && !lockedRoles?.includes(role)
          return <div key={role} className={`rounded-lg border bg-white p-3 text-xs ${signed ? 'border-[#c6e2ca]' : 'border-[#e1eaea]'}`}>
            <div className="flex items-start justify-between gap-2"><div><p className="font-bold text-[#315763]">{roleName(role)}</p><p className="mt-1 leading-5 text-[#789097]">{SIGNER_HELP[role]}</p></div>{signed ? <CheckCircle2 className="size-5 shrink-0 text-[#2f7d44]" aria-label="ลงนามแล้ว" /> : null}</div>
            {signed ? <>
              <div className="mt-3 flex h-20 items-center justify-center rounded-md border border-dashed border-[#b9d6d0] bg-[#fbfefc] p-2"><img src={`/api/attachments/${approval!.signatureAttachmentId}`} alt={`ลายเซ็น ${approval!.signerName ?? roleName(role)}`} className="max-h-full max-w-full object-contain" /></div>
              <p className="mt-2 font-semibold text-[#315763]">{approval!.signerName ?? approval!.approvedByName}</p>
              <p className="mt-0.5 text-[11px] text-[#789097]">ลงนามเมื่อ {formatDateTime(approval!.approvedAt)}</p>
              <p className="mt-0.5 text-[10px] text-[#9aafb4]">บันทึกโดยบัญชี {approval!.approvedByName}</p>
              {approval && (approval.approvedById === actor.id || actor.role === 'Admin') ? <Button variant="ghost" className="mt-2 min-h-9 px-2 py-1 text-xs" disabled={busyRole === role} onClick={() => revoke(role)}>ถอนลายเซ็น</Button> : null}
            </> : <>
              {legacyApproval ? <p className="mt-3 rounded-md border border-[#eed4a6] bg-[#fffaf0] px-2 py-1.5 text-[11px] leading-4 text-[#8b5c0b]">มีการยืนยันเดิมโดย {approval!.approvedByName} แต่ยังไม่มีภาพลายเซ็น</p> : <p className="mt-3 min-h-8 text-[#789097]">{assigneeName ? `รอ ${assigneeName} ลงนาม` : 'ยังไม่มีผู้ลงนามในระบบ · ใช้เครื่องนี้กรอกชื่อและเซ็นได้'}</p>}
              {canAct && signingRole !== role ? <Button className="mt-2 min-h-10 w-full px-3 py-2 text-xs" disabled={Boolean(readiness.length) || busyRole !== null} onClick={() => startSigning(role, assigneeName || approval?.signerName || '')}><PenLine className="size-4" />ลงนามตอนนี้</Button> : null}
              {canAct && signingRole === role ? <div className="mt-3 space-y-2 border-t border-[#e6eeee] pt-3"><Field label="ชื่อ-นามสกุลผู้ลงนาม" hint={assigneeName ? 'ชื่อนี้ผูกกับผู้รับผิดชอบในระบบ' : 'ผู้ลงนามไม่มีบัญชีในระบบ กรอกชื่อจริงที่อยู่หน้าเครื่อง'}><Input value={signerName} readOnly={Boolean(assigneeName && actor.role !== 'Admin')} autoFocus onChange={(event) => setSignerName(event.target.value)} /></Field><SignaturePad label={`ลายเซ็น${roleName(role)}`} onReady={onPadReady} /><div className="flex flex-wrap gap-2"><Button type="button" className="min-h-10 px-3 text-xs" disabled={busyRole === role} onClick={() => sign(role)}>{busyRole === role ? <LoaderCircle className="size-4 animate-spin" /> : <PenLine className="size-4" />}บันทึกลายเซ็น</Button><Button type="button" variant="secondary" className="min-h-10 px-3 text-xs" disabled={busyRole === role} onClick={cancelSigning}><X className="size-4" />ยกเลิก</Button></div></div> : null}
            </>}
          </div>
        })}
      </div>
    </div>
  )
}
