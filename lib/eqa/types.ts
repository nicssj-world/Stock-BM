export type EqaRoundStatus = 'scheduled' | 'received' | 'submitted' | 'evaluated' | 'closed'
export type EqaOutcome = 'acceptable' | 'warning' | 'unacceptable' | 'not-evaluated'
export type EqaRoundSummaryOutcome = 'pass' | 'fail' | 'not-evaluated'
export type EqaCondition = 'acceptable' | 'unacceptable'
export type EqaTemperatureCondition = 'refrigerated' | 'room' | 'other'
export type EqaDocumentType = 'annual-plan' | 'round-receipt' | 'annual-summary'
export type EqaApprovalRole = 'analyst' | 'technical-manager' | 'quality-manager' | 'section-head' | 'department-head'
export type EqaAssignedApprovalRole = Exclude<EqaApprovalRole, 'analyst'>

export interface EqaProvider {
  id: string
  name: string
  isActive: boolean
}

export interface EqaEquipment {
  id: string
  code: string
  name: string
  status: 'active' | 'maintenance' | 'out_of_service' | 'decommissioned'
}

export interface EqaScheme {
  id: string
  providerId: string
  providerName: string
  name: string
  code: string | null
  analyteScope: string | null
  roundsPerYear: number | null
  isActive: boolean
  equipment: EqaEquipment[]
}

export interface EqaPlanOccurrence {
  id: string
  planItemId: string
  plannedMonth: number
  responsibleUserId: string | null
  responsibleName: string | null
  responsibleCode: string
  sortOrder: number
}

export interface EqaPlanItem {
  id: string
  planId: string
  schemeId: string
  projectName: string
  providerName: string
  sampleSetName: string
  externalCode: string | null
  testItem: string
  expectedRounds: number | null
  maintenanceBudget: boolean
  tor: boolean
  price: number | null
  evaluationCriteria: string | null
  equipmentName: string | null
  note: string | null
  sortOrder: number
  occurrences: EqaPlanOccurrence[]
}

export interface EqaDocumentState {
  documentType: EqaDocumentType
  entityId: string
  revision: number
  status: 'draft' | 'approved'
}

export interface EqaDocumentApproval {
  id: string
  documentType: EqaDocumentType
  entityId: string
  revision: number
  approvalRole: EqaApprovalRole
  approvedById: string
  approvedByName: string
  approvedAt: string
}

export interface EqaApproverAssignment {
  approvalRole: EqaAssignedApprovalRole
  userId: string
  userName: string
}

export interface EqaAnnualPlan {
  id: string
  planYear: number
  workSection: string
  departmentName: string
  organizationName: string
  items: EqaPlanItem[]
  documentState: EqaDocumentState
  approvals: EqaDocumentApproval[]
  readiness: string[]
}

export interface EqaResult {
  id: string
  roundId: string
  analyte: string
  sampleCode: string | null
  submittedValue: string | null
  unit: string | null
  ctValue: number | null
  evaluationScore: number | null
  outcome: EqaOutcome
  iqcAnalyteId: string | null
  assignedValue: number | null
}

export interface EqaRound {
  id: string
  schemeId: string
  schemeName: string
  providerName: string
  equipment: EqaEquipment[]
  planItemId: string | null
  planYear: number | null
  planItemName: string | null
  roundLabel: string
  externalSentDate: string | null
  sampleReceivedDate: string | null
  resultDueDate: string | null
  submissionDate: string | null
  status: EqaRoundStatus
  note: string | null
  packageCondition: EqaCondition | null
  packageNote: string | null
  receivedTemperature: EqaTemperatureCondition | null
  receivedTemperatureNote: string | null
  sampleCondition: EqaCondition | null
  sampleConditionNote: string | null
  storageCondition: EqaTemperatureCondition | null
  storageTemperatureC: number | null
  storageNote: string | null
  specimenType: string | null
  receiverId: string | null
  receiverName: string | null
  analystId: string | null
  analystName: string | null
  analysisDate: string | null
  submissionMethod: string | null
  otherDetails: string | null
  summaryOutcome: EqaRoundSummaryOutcome
  summaryNote: string | null
  results: EqaResult[]
  dueInDays: number | null
  reminder: 'overdue' | 'due-soon' | null
  documentState: EqaDocumentState
  approvals: EqaDocumentApproval[]
  receiptReadiness: string[]
}

export interface EqaCorrectiveAction {
  id: string
  roundId: string
  roundLabel: string
  problem: string
  rootCause: string | null
  actionTaken: string | null
  status: 'open' | 'closed'
  createdByName: string | null
  createdAt: string
  closedByName: string | null
  closedAt: string | null
}

export interface EqaAnnualSummary {
  planItem: EqaPlanItem
  plan: Pick<EqaAnnualPlan, 'id' | 'planYear' | 'workSection' | 'departmentName' | 'organizationName'>
  rounds: EqaRound[]
  documentState: EqaDocumentState
  approvals: EqaDocumentApproval[]
  readiness: string[]
}

export interface EqaWorkspace {
  providers: EqaProvider[]
  schemes: EqaScheme[]
  annualPlans: EqaAnnualPlan[]
  rounds: EqaRound[]
  annualSummaries: EqaAnnualSummary[]
  correctiveActions: EqaCorrectiveAction[]
  approverAssignments: EqaApproverAssignment[]
  users: { id: string; displayName: string }[]
  iqcAnalytes: { id: string; code: string; name: string }[]
  summary: {
    schemeCount: number
    overdue: number
    dueSoon: number
    unacceptable: number
    openCorrectiveActions: number
  }
}

export const EQA_DUE_SOON_DAYS = 30
export const EQA_DOCUMENT_CODES = {
  'annual-plan': 'Fm-QP-LAB-19/01',
  'round-receipt': 'Fm-QP-LAB-19/02',
  'annual-summary': 'Fm-QP-LAB-19/04',
} as const satisfies Record<EqaDocumentType, string>

export const EQA_APPROVAL_ROLE_LABELS: Record<EqaApprovalRole, string> = {
  analyst: 'ผู้ทำการตรวจวิเคราะห์',
  'technical-manager': 'ผู้จัดการวิชาการ',
  'quality-manager': 'ผู้จัดการคุณภาพ',
  'section-head': 'หัวหน้างาน',
  'department-head': 'หัวหน้ากลุ่มงาน',
}
