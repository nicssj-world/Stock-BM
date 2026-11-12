// Vendor evaluation vocabulary and record shapes, ported from LABCBH-Stock lib/vendor-evaluation/annual-schema.ts.
// Pure: no I/O, safe for client and server. The database functions enforce the same rules.

export const VENDOR_EVALUATION_CRITERIA = ['delivery_completeness', 'shelf_life', 'product_packaging', 'documentation', 'item_correctness', 'cold_chain', 'complaint_performance', 'corrective_action'] as const
export type CriterionCode = (typeof VENDOR_EVALUATION_CRITERIA)[number]

export const VENDOR_EVALUATION_CRITERION_LABELS: Record<CriterionCode, string> = {
  delivery_completeness: 'การส่งมอบ / ความครบถ้วน',
  shelf_life: 'อายุสินค้า ณ วันที่รับ',
  product_packaging: 'สภาพสินค้า / บรรจุภัณฑ์',
  documentation: 'เอกสารประกอบ',
  item_correctness: 'ความถูกต้องของรายการ',
  cold_chain: 'การควบคุมอุณหภูมิ',
  complaint_performance: 'ข้อร้องเรียน / ปัญหา',
  corrective_action: 'การแก้ไขปัญหา',
}
export const criterionLabel = (code: string, fallback?: string) => VENDOR_EVALUATION_CRITERION_LABELS[code as CriterionCode] ?? fallback ?? code

export type PolicyStatus = 'proposed' | 'approved' | 'retired'
export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = { approved: 'อนุมัติแล้ว', proposed: 'ข้อเสนอ · รออนุมัติ', retired: 'เลิกใช้แล้ว' }

export type PolicyCriterion = {
  criterionCode: string
  displayOrder: number
  label: string
  weight: number | null
  evidenceDefinition: string
  calculationDefinition: string
  naDefinition: string
}

export type EvaluationPolicy = {
  id: string
  version: string
  status: PolicyStatus
  effectiveFromFiscalYear: number
  effectiveToFiscalYear: number | null
  passThreshold: number | null
  minimumCoveragePercent: number | null
  coverageStartDate: string
  note: string | null
  approvedAt: string | null
  approvedByName: string | null
  criteria: PolicyCriterion[]
}

export type PolicyProposalInput = {
  policyId: string | null
  version: string
  effectiveFromFiscalYear: number
  effectiveToFiscalYear: number | null
  passThreshold: number
  minimumCoveragePercent: number
  coverageStartDate: string
  note: string
  criteria: { criterionCode: string; weight: number }[]
}

/** Same rules the database applies, so a slip is reported in Thai before a round trip. */
export function policyProposalError(input: PolicyProposalInput): string | null {
  if (!input.version.trim()) return 'กรุณาระบุเวอร์ชันนโยบาย'
  if (!Number.isInteger(input.effectiveFromFiscalYear) || input.effectiveFromFiscalYear < 2500 || input.effectiveFromFiscalYear > 3000) return 'ปีงบประมาณที่เริ่มใช้ต้องเป็น พ.ศ. (2500–3000)'
  if (input.effectiveToFiscalYear !== null && (!Number.isInteger(input.effectiveToFiscalYear) || input.effectiveToFiscalYear < input.effectiveFromFiscalYear || input.effectiveToFiscalYear > 3000)) return 'ปีสิ้นสุดต้องไม่น้อยกว่าปีเริ่มใช้'
  for (const [value, name] of [[input.passThreshold, 'เกณฑ์ผ่าน'], [input.minimumCoveragePercent, 'ความครอบคลุมขั้นต่ำ']] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 100) return `${name}ต้องอยู่ระหว่าง 0–100`
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.coverageStartDate)) return 'กรุณาระบุวันเริ่มช่วงข้อมูล'
  if (input.criteria.length !== VENDOR_EVALUATION_CRITERIA.length || new Set(input.criteria.map((c) => c.criterionCode)).size !== VENDOR_EVALUATION_CRITERIA.length) return 'กรุณาระบุเกณฑ์ให้ครบและไม่ซ้ำ'
  if (input.criteria.some((c) => !Number.isFinite(c.weight) || c.weight <= 0 || c.weight > 100)) return 'น้ำหนักแต่ละเกณฑ์ต้องมากกว่า 0 และไม่เกิน 100'
  if (Math.abs(input.criteria.reduce((sum, c) => sum + c.weight, 0) - 100) > 0.001) return 'น้ำหนักรวมต้องเท่ากับ 100'
  return null
}

// ---- Evidence snapshot and annual evaluation records ---------------------------------------------------------------

export type Criterion = { criterionCode: string; displayOrder: number; numerator: number; denominator: number; applicable: boolean; percentage: number | null; supplementaryCount?: number }
export type SnapshotIssue = { id: string; issueType: string; sourceKind: string; status: string; openedAt: string; description: string; resolutionAction: string | null; resolutionNote: string | null; resolvedAt: string | null; invoiceNumber: string | null; eventNumber: string | null }
export type SnapshotReceipt = { eventNumber: string | null; receivedDate: string; invoiceNumber: string | null; poNumber: string | null; assessmentState: 'completed' | 'pending' | 'not_required' }
export type SnapshotAssessment = {
  eventNumber: string | null; receivedDate: string; invoiceNumber: string | null; productCondition: 'normal' | 'abnormal'; documentation: 'complete' | 'incomplete'; itemCorrectness: 'correct' | 'problem'
  coldChainApplicable: boolean; coldChainCondition: 'appropriate' | 'inappropriate' | null; hasComplaint: boolean; acceptanceDecision: 'accepted' | 'accepted_with_justification'; note: string | null; reasons: string[]; otherReasonDetail: string | null
}
export type Snapshot = {
  vendor: { id: string; vendorCode: string; name: string; legalName: string | null; taxId: string | null; taxBranchCode: string; address: string | null }
  fiscalYear: number
  coverage: { startDate: string; endDate: string; assessmentRequiredFrom: string; completed: number; pending: number; percentage: number | null }
  activity: { invoices: number; receipts: number; completedAssessments: number; pendingAssessments: number; openIssues: number; resolvedIssues: number }
  criteria: Criterion[]
  issues?: SnapshotIssue[]
  receipts?: SnapshotReceipt[]
  assessments?: SnapshotAssessment[]
  capturedAt: string
}
export type FrozenCriterion = Criterion & { label: string; weight: number; effectiveWeight: number | null; weightedScore: number | null; evidenceDefinition: string; calculationDefinition: string; naDefinition: string }
export type Signatory = { id: string; name: string; position: string }
export type Frozen = {
  evidence: Snapshot
  criteria: FrozenCriterion[]
  score: number
  result: 'pass' | 'fail'
  policy: { id: string; version: string; passThreshold: number; minimumCoveragePercent: number; approvedAt: string; approvedByName: string }
  judgment: { summary: string; strengths: string; risksConcerns: string; recommendations: string }
  signatories: { evaluator: Signatory; reviewer: Signatory; approver: Signatory }
  reportNumber: string
  revision: number
  finalizedAt: string
}

export type AnnualRevision = {
  id: string
  evaluationId: string
  vendorId: string
  fiscalYear: number
  revisionNumber: number
  supersedesRevisionId: string | null
  policyId: string
  policyVersion: string
  policyStatus: PolicyStatus
  status: 'draft' | 'final'
  evidence: Snapshot
  evidenceHash: string
  frozen: Frozen | null
  reportNumber: string | null
  summary: string | null
  strengths: string | null
  risksConcerns: string | null
  recommendations: string | null
  evaluatorId: string | null
  evaluatorName: string | null
  evaluatorPosition: string | null
  reviewerId: string | null
  reviewerName: string | null
  reviewerPosition: string | null
  approverId: string | null
  approverName: string | null
  approverPosition: string | null
  finalizedAt: string | null
  createdAt: string
  updatedAt: string
}

/** A score is only shown when the report is official: final, on an approved policy, with a number. */
export function isOfficial(r: Pick<AnnualRevision, 'status' | 'policyStatus' | 'frozen' | 'reportNumber'>) {
  return r.status === 'final' && r.policyStatus === 'approved' && r.frozen !== null && r.reportNumber !== null
}

export const RESULT_LABELS = { pass: 'ผ่าน', fail: 'ไม่ผ่าน' } as const
export type Signer = { id: string; name: string; position: string; hasSignature: boolean }

export type DraftInput = { summary: string; strengths: string; risksConcerns: string; recommendations: string; evaluatorId: string; reviewerId: string; approverId: string }

export function draftInputError(input: Pick<DraftInput, 'summary' | 'strengths' | 'risksConcerns' | 'recommendations'>): string | null {
  for (const value of Object.values(input)) if (value.length > 4000) return 'ข้อความยาวเกิน 4,000 ตัวอักษร'
  return null
}

export function finalizeReadiness(r: { summary: string | null; strengths: string | null; risksConcerns: string | null; recommendations: string | null; evaluatorId: string | null; reviewerId: string | null; approverId: string | null }, policyApproved: boolean): string[] {
  const problems: string[] = []
  if ([r.summary, r.strengths, r.risksConcerns, r.recommendations].some((value) => !value?.trim())) problems.push('Assessment narrative is incomplete')
  if (!policyApproved) problems.push('นโยบายที่ใช้ยังเป็นข้อเสนอ ยังไม่ได้อนุมัติ')
  if (!r.evaluatorId || !r.reviewerId || !r.approverId) problems.push('เลือกผู้ประเมิน ผู้ทบทวน และผู้อนุมัติให้ครบ')
  return problems
}
