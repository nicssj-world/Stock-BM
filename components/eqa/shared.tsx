'use client'

import { useState } from 'react'
import type { BmActor } from '@/lib/bm/types'
import type {
  EqaApprovalRole, EqaAssignedApprovalRole, EqaDocumentApproval, EqaDocumentState, EqaDocumentType, EqaWorkspace,
} from '@/lib/eqa/types'
import { EQA_APPROVAL_ROLE_LABELS } from '@/lib/eqa/types'
import type { EqaReadinessIssue, EqaReadinessTarget } from '@/lib/eqa/rules'
import { formatDateTime } from '@/lib/bm/rules'
import { api, Button, Select, StatusBadge, type StatusTone } from '@/components/ui'

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

export function ApprovalPanel({ actor, data, type, entityId, state, approvals, readiness, analystId, visibleRoles, onNavigate, onOk, onErr }: {
  actor: BmActor; data: EqaWorkspace; type: EqaDocumentType; entityId: string; state: EqaDocumentState; approvals: EqaDocumentApproval[]; readiness: EqaReadinessIssue[]; analystId?: string | null; visibleRoles?: EqaApprovalRole[]; onNavigate?: (target: EqaReadinessTarget) => void; onOk: Update; onErr: (text: string) => void
}) {
  const allRoles: EqaApprovalRole[] = type === 'round-receipt' ? ['analyst', 'technical-manager'] : APPROVAL_ROLES
  const roles = visibleRoles ? allRoles.filter((role) => visibleRoles.includes(role)) : allRoles
  const [busyRole, setBusyRole] = useState<EqaApprovalRole | null>(null)
  async function mutate(role: EqaApprovalRole, method: 'POST' | 'DELETE') {
    setBusyRole(role)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/documents/${type}/${entityId}/approvals`, { method, body: JSON.stringify({ approvalRole: role }) })
      onOk(method === 'POST' ? 'ยืนยันเอกสารแล้ว' : 'ถอนการยืนยันแล้ว', result.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ') } finally { setBusyRole(null) }
  }
  function canApprove(role: EqaApprovalRole) {
    if (role === 'analyst') return analystId === actor.id
    return data.approverAssignments.some((assignment) => assignment.approvalRole === role && assignment.userId === actor.id)
  }
  return (
    <div className="mt-3 rounded-md border border-[#dfe9ea] bg-[#f9fcfc] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-[#315763]">การอนุมัติ · revision {state.revision}</p>
        <StatusBadge tone={state.status === 'approved' ? 'accepted' : 'warning'} label={state.status === 'approved' ? 'อนุมัติครบ' : 'ฉบับร่าง'} />
      </div>
      {readiness.length ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-[#a9700f]">
          {readiness.map((issue) => (
            <li key={issue.message}>
              {issue.target && onNavigate ? (
                <button type="button" className="text-left underline decoration-dotted hover:text-[#8a5a08]" onClick={() => onNavigate(issue.target!)}>{issue.message}</button>
              ) : issue.message}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-[#087f75]">ข้อมูลพร้อมสำหรับการยืนยัน</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((role) => {
          const approval = approvals.find((item) => item.approvalRole === role)
          return <div key={role} className="rounded border border-[#e1eaea] bg-white p-2 text-xs">
            <p className="font-bold text-[#315763]">{EQA_APPROVAL_ROLE_LABELS[role]}</p>
            <p className="mt-1 min-h-8 text-[#789097]">{approval ? `${approval.approvedByName} · ${formatDateTime(approval.approvedAt)}` : 'ยังไม่ยืนยัน'}</p>
            {approval && (approval.approvedById === actor.id || actor.role === 'Admin') ? <Button variant="ghost" className="mt-1 min-h-7 px-2 py-1 text-xs" disabled={busyRole === role} onClick={() => mutate(role, 'DELETE')}>ถอน</Button> : null}
            {!approval && canApprove(role) ? <Button className="mt-1 min-h-7 px-2 py-1 text-xs" disabled={Boolean(readiness.length) || busyRole === role} onClick={() => mutate(role, 'POST')}>ยืนยัน</Button> : null}
          </div>
        })}
      </div>
    </div>
  )
}
