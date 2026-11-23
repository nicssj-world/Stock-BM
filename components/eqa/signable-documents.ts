import type { EqaApprovalRole, EqaDocumentApproval, EqaDocumentState, EqaDocumentType, EqaWorkspace } from '@/lib/eqa/types'
import { annualSummaryIssues, roundReceiptIssues, roundStatusIndex, type EqaReadinessIssue } from '@/lib/eqa/rules'
import { APPROVAL_ROLES } from '@/components/eqa/shared'

export type SignableDocument = {
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

export const DOCUMENT_TYPE_LABEL: Record<EqaDocumentType, string> = {
  'annual-plan': 'แผน EQA ประจำปี',
  'round-receipt': 'แบบรับตัวอย่าง',
  'annual-summary': 'สรุปผล EQA รายปี',
}

/**
 * Every EQA document that can be signed now, with the roles to show: all of
 * them, or only `onlyRoles` (a Signer's own roles). A round receipt is listed
 * once the analyst has signed and the evaluation is saved -- the analyst signs
 * on the round card itself.
 */
export function signableDocuments(data: EqaWorkspace, onlyRoles?: EqaApprovalRole[]): SignableDocument[] {
  const mine = (roles: EqaApprovalRole[]) => (onlyRoles ? roles.filter((role) => onlyRoles.includes(role)) : roles)
  const documents: SignableDocument[] = []
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
      readiness: roundReceiptIssues(round), roles: mine(onlyRoles ? ['technical-manager'] : ['analyst', 'technical-manager']),
    })
  }
  return documents.filter((document) => document.roles.length > 0)
}

export function isSignedBy(document: SignableDocument, role: EqaApprovalRole) {
  return Boolean(document.approvals.find((approval) => approval.approvalRole === role)?.signatureAttachmentId)
}
