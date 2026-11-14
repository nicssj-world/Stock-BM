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
import { MySignatureField, useMySignature, type MySignatureHandle } from '@/components/my-signature-field'

export type Tab = 'plans' | 'rounds' | 'corrective' | 'reports' | 'manage'
export const TAB_KEYS: Tab[] = ['plans', 'rounds', 'corrective', 'reports', 'manage']
export type EqaFocus = { roundId?: string; resultId?: string; open?: 'receipt' | 'result' | 'summary'; actionId?: string; corrective?: boolean }
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
  const [signAs, setSignAs] = useState<'self' | 'other'>('other')
  const pad = useRef<SignaturePadHandle | null>(null)
  const onPadReady = useCallback((handle: SignaturePadHandle) => { pad.current = handle }, [])
  const mine = useMySignature()
  const mySignature = useRef<MySignatureHandle | null>(null)
  const onMySignatureReady = useCallback((handle: MySignatureHandle) => { mySignature.current = handle }, [])

  /** true: this role is the signed-in user's own · false: someone else's · null: unassigned (anyone may sign). */
  function isOwnRole(role: EqaApprovalRole): boolean | null {
    if (role === 'analyst') return analystId ? analystId === actor.id : null
    const assignment = data.approverAssignments.find((item) => item.approvalRole === role)
    return assignment ? assignment.userId === actor.id : null
  }

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
    // The user's own role signs as themselves. An unassigned role defaults to a
    // signer without an account (drawn on this device), but can be switched.
    setSignAs(isOwnRole(role) === true ? 'self' : 'other')
    pad.current = null
    mySignature.current = null
  }

  function cancelSigning() {
    setSigningRole(null)
    setSignerName('')
    pad.current = null
    mySignature.current = null
  }

  // One tap for the user's own role when a signature is already saved.
  async function signWithSaved(role: EqaApprovalRole) {
    const form = new FormData()
    form.set('approvalRole', role)
    form.set('useSavedSignature', '1')
    await submitSignature(role, form, false)
  }

  async function submitSignature(role: EqaApprovalRole, form: FormData, remember: boolean, drawn: File | null = null) {
    setBusyRole(role)
    try {
      const response = await fetch(`/api/eqa/documents/${type}/${entityId}/approvals`, { method: 'POST', body: form })
      const payload = await response.json().catch(() => ({})) as { eqa?: EqaWorkspace; error?: string }
      if (!response.ok || !payload.eqa) throw new Error(payload.error ?? 'ลงนามไม่สำเร็จ')
      const remembered = remember && drawn ? await mySignature.current?.rememberIfRequested(drawn) : false
      cancelSigning()
      onOk(`ลงนาม${roleName(role)}แล้ว${remembered ? ' · เก็บลายเซ็นไว้ใช้ครั้งต่อไปแล้ว' : ''}`, payload.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ลงนามไม่สำเร็จ') } finally { setBusyRole(null) }
  }

  async function sign(role: EqaApprovalRole) {
    const form = new FormData()
    form.set('approvalRole', role)
    let drawn: File | null = null
    if (signAs === 'self') {
      const handle = mySignature.current
      if (!handle?.isReady()) return onErr('กรุณาวาดลายเซ็นก่อนลงนาม')
      if (handle.usesSaved()) form.set('useSavedSignature', '1')
      else {
        drawn = await handle.drawnFile()
        if (!drawn) return onErr('อ่านลายเซ็นไม่สำเร็จ กรุณาเซ็นใหม่อีกครั้ง')
        form.set('signerName', actor.displayName)
        form.set('signature', drawn)
      }
    } else {
      if (!signerName.trim()) return onErr('กรุณากรอกชื่อ-นามสกุลผู้ลงนาม')
      if (pad.current?.isEmpty() !== false) return onErr('กรุณาวาดลายเซ็นก่อนลงนาม')
      drawn = (await pad.current?.toFile()) ?? null
      if (!drawn) return onErr('อ่านลายเซ็นไม่สำเร็จ กรุณาเซ็นใหม่อีกครั้ง')
      form.set('signerName', signerName.trim())
      form.set('signature', drawn)
    }
    await submitSignature(role, form, signAs === 'self', drawn)
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
              {legacyApproval ? <p className="mt-3 rounded-md border border-[#eed4a6] bg-[#fffaf0] px-2 py-1.5 text-[11px] leading-4 text-[#8b5c0b]">มีการยืนยันเดิมโดย {approval!.approvedByName} แต่ยังไม่มีภาพลายเซ็น</p> : <p className="mt-3 min-h-8 text-[#789097]">{isOwnRole(role) === true ? 'รอคุณลงนาม' : assigneeName ? `รอ ${assigneeName} ลงนาม` : 'ยังไม่มีผู้ลงนามในระบบ · ใช้เครื่องนี้กรอกชื่อและเซ็นได้'}</p>}
              {canAct && signingRole !== role && isOwnRole(role) === true && mine.signature ? <>
                <Button className="mt-2 min-h-10 w-full px-3 py-2 text-xs" disabled={Boolean(readiness.length) || busyRole !== null} onClick={() => signWithSaved(role)}>{busyRole === role ? <LoaderCircle className="size-4 animate-spin" /> : <PenLine className="size-4" />}ลงนามด้วยลายเซ็นของฉัน</Button>
                <button type="button" className="mt-1 min-h-9 w-full rounded-md text-[11px] font-semibold text-[#58747d] hover:text-[#173d50] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none disabled:opacity-50" disabled={Boolean(readiness.length) || busyRole !== null} onClick={() => startSigning(role, assigneeName || approval?.signerName || '')}>ดูลายเซ็นหรือวาดใหม่ก่อนลงนาม</button>
              </> : canAct && signingRole !== role ? <Button className="mt-2 min-h-10 w-full px-3 py-2 text-xs" disabled={Boolean(readiness.length) || busyRole !== null} onClick={() => startSigning(role, assigneeName || approval?.signerName || '')}><PenLine className="size-4" />ลงนามตอนนี้</Button> : null}
              {canAct && signingRole === role ? <div className="mt-3 space-y-2 border-t border-[#e6eeee] pt-3">
                {isOwnRole(role) === null ? (
                  <div className="grid grid-cols-2 gap-1 rounded-md bg-[#eef5f4] p-1" role="radiogroup" aria-label="ผู้ลงนาม">
                    {([['self', 'ฉันเป็นผู้ลงนาม'], ['other', 'ผู้ลงนามคนอื่น']] as const).map(([value, text]) => (
                      <button key={value} type="button" role="radio" aria-checked={signAs === value} onClick={() => setSignAs(value)} className={`min-h-9 rounded px-2 text-[11px] font-bold focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${signAs === value ? 'bg-white text-[#0b7f76] shadow-sm' : 'text-[#58747d]'}`}>{text}</button>
                    ))}
                  </div>
                ) : null}
                {signAs === 'self' ? <>
                  <p className="text-[11px] text-[#58747d]">ลงนามในชื่อ <strong className="text-[#173d50]">{assigneeName || actor.displayName}</strong></p>
                  <MySignatureField label={`ลายเซ็น${roleName(role)}`} onReady={onMySignatureReady} />
                </> : <>
                  <Field label="ชื่อ-นามสกุลผู้ลงนาม" hint={assigneeName ? 'ชื่อนี้ผูกกับผู้รับผิดชอบในระบบ · ให้ผู้ลงนามวาดลายเซ็นเอง' : 'ผู้ลงนามไม่มีบัญชีในระบบ กรอกชื่อจริงที่อยู่หน้าเครื่อง'}><Input value={signerName} readOnly={Boolean(assigneeName && actor.role !== 'Admin')} autoFocus onChange={(event) => setSignerName(event.target.value)} /></Field>
                  <SignaturePad label={`ลายเซ็น${roleName(role)}`} onReady={onPadReady} />
                </>}
                <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-10 px-3 text-xs" disabled={busyRole === role} onClick={() => sign(role)}>{busyRole === role ? <LoaderCircle className="size-4 animate-spin" /> : <PenLine className="size-4" />}ลงนาม</Button><Button type="button" variant="secondary" className="min-h-10 px-3 text-xs" disabled={busyRole === role} onClick={cancelSigning}><X className="size-4" />ยกเลิก</Button></div>
              </div> : null}
            </>}
          </div>
        })}
      </div>
    </div>
  )
}
