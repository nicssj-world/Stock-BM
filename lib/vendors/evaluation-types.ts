import type { Vendor, VendorSignificantEvent } from '@/lib/receiving/types'
import type { VendorMetrics } from './types'

export const VENDOR_EVALUATION_ROLES = ['evaluator', 'reviewer', 'approver'] as const
export type VendorEvaluationRole = (typeof VENDOR_EVALUATION_ROLES)[number]

export type VendorEvaluationJudgment = {
  summary: string
  strengths: string
  risks: string
  actions: string
}

export type VendorEvaluation = {
  id: string
  vendorId: string
  fiscalYear: string
  revision: number
  metricsSnapshot: VendorMetrics
  judgment: VendorEvaluationJudgment
  significantEventsSnapshot: VendorSignificantEvent[]
  policyId: string | null
  result: number | null
  resultLabel: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type VendorEvaluationDocumentState = {
  evaluationId: string
  revision: number
  status: 'draft' | 'approved'
  updatedAt: string
}

export type VendorEvaluationApproval = {
  id: string
  evaluationId: string
  revision: number
  approvalRole: VendorEvaluationRole
  approvedBy: string
  approvedByName: string
  approvedAt: string
  signerName: string | null
  signatureAttachmentId: string | null
}

export type VendorEvaluationAssignment = {
  approvalRole: VendorEvaluationRole
  userId: string
  userName: string
}

export type VendorEvaluationWorkspace = {
  vendor: Vendor
  evaluation: VendorEvaluation
  documentState: VendorEvaluationDocumentState
  approvals: VendorEvaluationApproval[]
  assignments: VendorEvaluationAssignment[]
  policy: { id: string; version: number; isApproved: boolean }
}
