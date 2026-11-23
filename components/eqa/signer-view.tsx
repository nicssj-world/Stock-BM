'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { EqaWorkspace } from '@/lib/eqa/types'
import { EQA_APPROVAL_ROLE_LABELS } from '@/lib/eqa/types'
import { Card, Notice, PageHeader, StatusBadge } from '@/components/ui'
import { ApprovalPanel, type NoticeState, type Update } from '@/components/eqa/shared'
import { DOCUMENT_TYPE_LABEL, isSignedBy, signableDocuments, type SignableDocument } from '@/components/eqa/signable-documents'

/**
 * EQA for a Signer account (an approver from outside the unit): only the
 * documents carrying a role assigned to them, each with its report to review
 * and the signing card for their role. Editing is not offered (the API also
 * rejects it).
 */
export function EqaSignerView({ actor, initialData }: { actor: BmActor; initialData: EqaWorkspace }) {
  const [data, setData] = useState(initialData)
  const [notice, setNotice] = useState<NoticeState>(null)
  const [showSigned, setShowSigned] = useState(false)
  const ok: Update = (text, next) => { setData(next); setNotice({ tone: 'success', text }) }
  const err = (text: string) => setNotice({ tone: 'danger', text })

  const myRoles = data.approverAssignments.filter((assignment) => assignment.userId === actor.id).map((assignment) => assignment.approvalRole)
  const documents = signableDocuments(data, myRoles)
  const pending = documents.filter((document) => document.roles.some((role) => !isSignedBy(document, role)))
  const signed = documents.filter((document) => !pending.includes(document))

  const renderDocument = (document: SignableDocument) => (
    <Card key={document.key} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-[#0b7f76]">{DOCUMENT_TYPE_LABEL[document.type]}</p>
          <h2 className="mt-0.5 font-bold text-[#173d50]">{document.title}</h2>
          {document.subtitle ? <p className="mt-0.5 text-xs text-[#789097]">{document.subtitle}</p> : null}
        </div>
        <Link href={document.reportHref} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#cfe1e0] bg-white px-3 text-xs font-semibold text-[#0b7f76] hover:bg-[#f2faf8] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">
          <FileText className="size-4" aria-hidden="true" />ดูเอกสารก่อนลงนาม
        </Link>
      </div>
      <ApprovalPanel actor={actor} data={data} type={document.type} entityId={document.entityId} state={document.state} approvals={document.approvals} readiness={document.readiness} visibleRoles={document.roles} onOk={ok} onErr={err} />
    </Card>
  )

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader eyebrow="External Quality Assessment" title="เอกสาร EQA ที่รอคุณลงนาม" description="เปิดดูเอกสารฉบับเต็มก่อน แล้วลงนามตามบทบาทของคุณ · บันทึกลายเซ็นไว้ที่หน้า “ลายเซ็นของฉัน” เพื่อกดลงนามได้ในครั้งเดียว" />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {myRoles.length === 0 ? (
        <Notice tone="warning">บัญชีนี้ยังไม่ได้รับมอบหมายบทบาทลงนาม · ติดต่อ Admin ให้กำหนดที่ EQA → จัดการ → ผู้อนุมัติ</Notice>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#58747d]">
            <span>บทบาทของคุณ:</span>
            {myRoles.map((role) => <StatusBadge key={role} tone="neutral" label={EQA_APPROVAL_ROLE_LABELS[role]} />)}
          </div>
          {pending.length ? pending.map(renderDocument) : <Card className="p-6 text-center text-sm text-[#58747d]">ไม่มีเอกสารที่รอคุณลงนามตอนนี้</Card>}
          {signed.length ? (
            <div className="space-y-3">
              <button type="button" onClick={() => setShowSigned((value) => !value)} className="min-h-10 text-sm font-semibold text-[#0b7f76] hover:underline focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none" aria-expanded={showSigned}>
                {showSigned ? 'ซ่อน' : 'แสดง'}เอกสารที่คุณลงนามแล้ว ({signed.length})
              </button>
              {showSigned ? signed.map(renderDocument) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
