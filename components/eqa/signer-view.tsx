'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { EqaApprovalRole, EqaDocumentApproval, EqaDocumentState, EqaDocumentType, EqaWorkspace } from '@/lib/eqa/types'
import { EQA_APPROVAL_ROLE_LABELS } from '@/lib/eqa/types'
import { annualSummaryIssues, roundReceiptIssues, roundStatusIndex, type EqaReadinessIssue } from '@/lib/eqa/rules'
import { Card, Notice, PageHeader, StatusBadge } from '@/components/ui'
import { APPROVAL_ROLES, ApprovalPanel, type NoticeState, type Update } from '@/components/eqa/shared'

type SignerDocument = {
  key: string
  type: EqaDocumentType
  entityId: string
  title: string
  subtitle: string
  reportHref: string
  state: EqaDocumentState
  approvals: EqaDocumentApproval[]
  readiness: EqaReadinessIssue[]
  roles: EqaApprovalRole[]
}

const TYPE_LABEL: Record<EqaDocumentType, string> = {
  'annual-plan': 'แผน EQA ประจำปี',
  'round-receipt': 'แบบรับตัวอย่าง',
  'annual-summary': 'สรุปผล EQA รายปี',
}

function signerDocuments(data: EqaWorkspace, myRoles: EqaApprovalRole[]): SignerDocument[] {
  const mine = (roles: EqaApprovalRole[]) => roles.filter((role) => myRoles.includes(role))
  const documents: SignerDocument[] = []
  for (const plan of data.annualPlans) {
    documents.push({
      key: `annual-plan:${plan.id}`, type: 'annual-plan', entityId: plan.id,
      title: `แผน EQA ประจำปี ${plan.planYear + 543}`, subtitle: [plan.workSection, plan.departmentName].filter(Boolean).join(' · '),
      reportHref: `/eqa/report/annual-plan/${plan.id}`, state: plan.documentState, approvals: plan.approvals,
      readiness: plan.readiness.map((message) => ({ message })), roles: mine(APPROVAL_ROLES),
    })
  }
  for (const summary of data.annualSummaries) {
    documents.push({
      key: `annual-summary:${summary.planItem.id}`, type: 'annual-summary', entityId: summary.planItem.id,
      title: summary.planItem.sampleSetName, subtitle: `ปี ${summary.plan.planYear + 543} · ${summary.planItem.projectName} · ${summary.rounds.length}/${summary.planItem.expectedRounds ?? '-'} รอบ`,
      reportHref: `/eqa/report/annual-summary/${summary.planItem.id}`, state: summary.documentState, approvals: summary.approvals,
      readiness: annualSummaryIssues(summary.planItem, summary.rounds, data.correctiveActions), roles: mine(APPROVAL_ROLES),
    })
  }
  for (const round of data.rounds) {
    // The technical manager signs a receipt only after the analyst has signed
    // and the round's evaluation is saved (same rule as the rounds tab).
    const analystSigned = round.approvals.some((approval) => approval.approvalRole === 'analyst' && approval.signatureAttachmentId)
    if (!analystSigned || roundStatusIndex(round.status) < roundStatusIndex('evaluated')) continue
    documents.push({
      key: `round-receipt:${round.id}`, type: 'round-receipt', entityId: round.id,
      title: `${round.planItemName ?? round.schemeName} · ${round.roundLabel}`, subtitle: round.providerName,
      reportHref: `/eqa/report/round-receipt/${round.id}`, state: round.documentState, approvals: round.approvals,
      readiness: roundReceiptIssues(round), roles: mine(['technical-manager']),
    })
  }
  return documents.filter((document) => document.roles.length > 0)
}

function isSignedBy(document: SignerDocument, role: EqaApprovalRole) {
  return Boolean(document.approvals.find((approval) => approval.approvalRole === role)?.signatureAttachmentId)
}

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
  const documents = signerDocuments(data, myRoles)
  const pending = documents.filter((document) => document.roles.some((role) => !isSignedBy(document, role)))
  const signed = documents.filter((document) => !pending.includes(document))

  const renderDocument = (document: SignerDocument) => (
    <Card key={document.key} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-[#0b7f76]">{TYPE_LABEL[document.type]}</p>
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
