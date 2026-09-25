'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, Button, Field, Notice, Select, StatusBadge, Textarea, type StatusTone } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'
import { formatThaiDateTime } from '@/lib/bm/thai-date'
import {
  ISSUE_CANCEL_REASON_LABELS, ISSUE_MANUAL_CANCEL_REASONS, ISSUE_RESOLUTION_ACTIONS, ISSUE_RESOLUTION_LABELS, ISSUE_SOURCE_LABELS,
  ISSUE_STATUS_LABELS, ISSUE_TYPE_LABELS, VENDOR_ISSUE_TYPES, type VendorIssue,
} from '@/lib/vendors/issues'

const tone: Record<string, StatusTone> = { open: 'warning', resolved: 'accepted', cancelled: 'not_evaluated' }

/**
 * LABCBH-Stock VendorIssuePanel: list, act (resolve / attach evidence / cancel) and open manual issues.
 * Staff and Admin open issues; only an Admin resolves or cancels them. Evidence is attached while an issue is open.
 */
export function VendorIssuePanel({ issues, vendorId, invoices, canOpen, canAct, emptyText = 'ยังไม่มีปัญหาผู้ขาย' }: {
  issues: VendorIssue[]; vendorId: string; invoices: { id: string; invoiceNo: string | null }[]; canOpen: boolean; canAct: boolean; emptyText?: string
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [action, setAction] = useState<string>('verified_no_impact')
  const [note, setNote] = useState('')
  const [cancelReason, setCancelReason] = useState<string>('duplicate')
  const [cancelNote, setCancelNote] = useState('')
  const [type, setType] = useState<string>('other')
  const [description, setDescription] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const selected = issues.find((i) => i.id === selectedId) ?? null

  function run(work: () => Promise<unknown>, after?: () => void) {
    setError(null); setMessage(null)
    startTransition(async () => {
      try { await work(); after?.(); router.refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'ทำรายการไม่สำเร็จ') }
    })
  }
  const patchIssue = (issue: VendorIssue, body: object) => api(`/api/vendors/${vendorId}/issues/${issue.id}`, { method: 'PATCH', body: JSON.stringify(body) })
  const submitResolve = (event: FormEvent) => { event.preventDefault(); if (selected) run(() => patchIssue(selected, { action: 'resolve', resolutionAction: action, note }), () => { setSelectedId(null); setNote(''); setMessage('บันทึกการแก้ไขแล้ว') }) }
  const submitManual = (event: FormEvent) => { event.preventDefault(); run(() => api(`/api/vendors/${vendorId}/issues`, { method: 'POST', body: JSON.stringify({ issueType: type, description, invoiceId: invoiceId || null }) }), () => { setDescription(''); setMessage('บันทึกปัญหาแล้ว') }) }
  const submitCancel = () => { if (selected) run(() => patchIssue(selected, { action: 'cancel', reason: cancelReason, note: cancelNote || null }), () => { setSelectedId(null); setCancelNote(''); setMessage('ยกเลิกปัญหาแล้ว') }) }

  return <div className="space-y-4">
    {issues.length === 0 ? <p className="text-sm text-[#81979c]">{emptyText}</p> : <ul className="space-y-2">{issues.map((issue) => <li key={issue.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${issue.status === 'open' ? 'border-[#e6c987] bg-[#fffaf0]' : issue.status === 'resolved' ? 'border-[#b7dcc6] bg-[#f3faf6]' : 'border-[#ccd8de] text-[#6a838c]'} ${selectedId === issue.id ? 'ring-2 ring-[#0b7f76]' : ''}`}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{ISSUE_TYPE_LABELS[issue.issueType] ?? issue.issueType}</strong><StatusBadge tone={tone[issue.status] ?? 'neutral'} label={ISSUE_STATUS_LABELS[issue.status] ?? issue.status} /></div>
        <p className="text-xs text-[#81979c]">{ISSUE_SOURCE_LABELS[issue.sourceKind] ?? issue.sourceKind} · เปิดเมื่อ {formatThaiDateTime(issue.openedAt)}</p>
        <p className="break-words text-sm">{issue.description}</p>
        {issue.status === 'resolved' && issue.resolutionAction && <p className="text-sm"><strong>{ISSUE_RESOLUTION_LABELS[issue.resolutionAction] ?? issue.resolutionAction}</strong>{issue.resolutionNote ? ` — ${issue.resolutionNote}` : ''}</p>}
        {issue.status === 'cancelled' && issue.cancelledReason && <p className="text-sm">ยกเลิก: {ISSUE_CANCEL_REASON_LABELS[issue.cancelledReason] ?? issue.cancelledReason}{issue.cancelledNote ? ` — ${issue.cancelledNote}` : ''}</p>}
      </div>
      {canAct && issue.status !== 'cancelled' && <Button type="button" variant="secondary" className="shrink-0" aria-expanded={selectedId === issue.id} onClick={() => setSelectedId(selectedId === issue.id ? null : issue.id)}>{selectedId === issue.id ? 'ปิด' : 'ดำเนินการ'}</Button>}
    </li>)}</ul>}

    {selected && <div className="space-y-4 rounded-lg border border-[#c9dadd] bg-white p-4" role="group" aria-label={`ดำเนินการกับปัญหา ${ISSUE_TYPE_LABELS[selected.issueType] ?? ''}`}>
      {selected.status === 'open' && <form onSubmit={submitResolve} className="space-y-3"><h3 className="font-bold text-[#173d50]">บันทึกการแก้ไขปัญหา</h3>
        <Field label="วิธีดำเนินการ"><Select value={action} onChange={(e) => setAction(e.target.value)}>{ISSUE_RESOLUTION_ACTIONS.map((a) => <option key={a} value={a}>{ISSUE_RESOLUTION_LABELS[a]}</option>)}</Select></Field>
        <Field label="รายละเอียดการแก้ไข"><Textarea rows={3} required value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></Field>
        <Button type="submit" disabled={pending || !note.trim()}>ยืนยันว่าแก้ไขแล้ว</Button></form>}
      {selected.status === 'open' && <div className="space-y-2"><h3 className="font-bold text-[#173d50]">หลักฐานประกอบ (ไม่บังคับ)</h3>
        <AttachmentList module="stock" entityType="vendor-issue" entityId={selected.id} kind="vendor-issue-evidence" canDelete accept="image/jpeg,image/png,image/webp,application/pdf" label="หลักฐานของปัญหานี้" /></div>}
      {selected.status !== 'cancelled' && <div className="space-y-3"><h3 className="font-bold text-[#173d50]">ยกเลิกปัญหา</h3>
        <Field label="เหตุผล"><Select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>{ISSUE_MANUAL_CANCEL_REASONS.map((r) => <option key={r} value={r}>{ISSUE_CANCEL_REASON_LABELS[r]}</option>)}</Select></Field>
        {cancelReason === 'other' && <Field label="ระบุเหตุผลอื่น"><Textarea rows={2} value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} /></Field>}
        <Button type="button" variant="danger" disabled={pending || (cancelReason === 'other' && !cancelNote.trim())} onClick={() => { if (window.confirm('ยืนยันยกเลิกปัญหานี้? การยกเลิกย้อนกลับไม่ได้')) submitCancel() }}>ยกเลิกปัญหานี้</Button></div>}
    </div>}

    {canOpen && <form onSubmit={submitManual} className="space-y-3 border-t border-[#e5eeee] pt-4"><h3 className="font-bold text-[#173d50]">บันทึกปัญหาเพิ่มเติม</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ประเภทปัญหา"><Select value={type} onChange={(e) => setType(e.target.value)}>{VENDOR_ISSUE_TYPES.map((t) => <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>)}</Select></Field>
        <Field label="Invoice (ถ้ามี)"><Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}><option value="">ไม่ระบุ</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNo ?? i.id.slice(0, 8)}</option>)}</Select></Field>
      </div>
      <Field label="รายละเอียด"><Textarea rows={3} required value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} /></Field>
      <Button type="submit" variant="secondary" disabled={pending || !description.trim()}>เปิดปัญหา</Button></form>}
    {message && <Notice tone="success">{message}</Notice>}
    {error && <Notice tone="danger">{error}</Notice>}
  </div>
}
