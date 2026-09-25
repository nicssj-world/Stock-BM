// Receipt Assessment: the post-receipt questionnaire that feeds Vendor
// Performance. There is deliberately no quantity question — received and
// expected quantities come from the receipt itself (see receiptQuantitySummary).

export type ProductCondition = 'normal' | 'abnormal'
export type DocumentationState = 'complete' | 'incomplete'
export type ItemCorrectness = 'correct' | 'problem'
export type ColdChainCondition = 'appropriate' | 'inappropriate'
export type ReceiptAssessmentStatus = 'pending' | 'completed'

// Reasons required when any answer is abnormal (LABCBH-Stock rules). The database enforces the same rules.
export const ASSESSMENT_REASON_CODES = ['urgent_need', 'no_alternative', 'usable_condition', 'vendor_will_correct', 'documentation_pending', 'consume_before_expiry', 'approved_exception', 'other'] as const
export type ReasonCode = (typeof ASSESSMENT_REASON_CODES)[number]
export const REASON_LABELS: Record<ReasonCode, string> = {
  urgent_need: 'จำเป็นต้องใช้เร่งด่วน',
  no_alternative: 'ไม่มีสินค้าทดแทน',
  usable_condition: 'ยังอยู่ในสภาพใช้งานได้',
  vendor_will_correct: 'ผู้ขายจะดำเนินการแก้ไข',
  documentation_pending: 'เอกสารอยู่ระหว่างติดตาม',
  consume_before_expiry: 'วางแผนใช้ก่อนหมดอายุ',
  approved_exception: 'ผู้มีอำนาจอนุมัติข้อยกเว้น',
  other: 'เหตุผลอื่น',
}
export type AcceptanceDecision = 'accepted' | 'accepted_with_justification'

export type ReceiptAssessmentAnswers = {
  productCondition: ProductCondition | null
  documentation: DocumentationState | null
  itemCorrectness: ItemCorrectness | null
  coldChainApplicable: boolean | null
  coldChainCondition: ColdChainCondition | null
  hasComplaint: boolean | null
  note: string
  reasonCodes: ReasonCode[]
  otherReasonDetail: string
}

export type ReceiptAssessment = {
  id: string
  receiptId: string
  vendorId: string
  status: ReceiptAssessmentStatus
  productCondition: ProductCondition | null
  documentation: DocumentationState | null
  itemCorrectness: ItemCorrectness | null
  coldChainApplicable: boolean | null
  coldChainCondition: ColdChainCondition | null
  hasComplaint: boolean | null
  note: string | null
  reasonCodes: ReasonCode[]
  otherReasonDetail: string | null
  acceptanceDecision: AcceptanceDecision | null
  assessedBy: string | null
  assessedAt: string | null
  createdAt: string
  updatedAt: string
}

export const EMPTY_ASSESSMENT_ANSWERS: ReceiptAssessmentAnswers = {
  productCondition: null,
  documentation: null,
  itemCorrectness: null,
  coldChainApplicable: null,
  coldChainCondition: null,
  hasComplaint: null,
  note: '',
  reasonCodes: [],
  otherReasonDetail: '',
}

export const ASSESSMENT_LABELS = {
  productCondition: { title: 'สภาพสินค้า/บรรจุภัณฑ์', options: { normal: 'ปกติ', abnormal: 'ชำรุด/ผิดปกติ' } },
  documentation: { title: 'เอกสารประกอบ', options: { complete: 'ครบ/ถูกต้อง', incomplete: 'ไม่ครบ/ไม่ถูกต้อง' } },
  itemCorrectness: { title: 'สินค้าที่ได้รับ', options: { correct: 'ถูกต้อง', problem: 'ผิดรายการ / มีปัญหา' } },
  coldChainApplicable: { title: 'Cold chain applicable?', options: { false: 'ไม่เกี่ยวข้อง', true: 'เกี่ยวข้อง' } },
  coldChainCondition: { title: 'สภาพ/อุณหภูมิ', options: { appropriate: 'เหมาะสม', inappropriate: 'ไม่เหมาะสม' } },
  hasComplaint: { title: 'มีปัญหา/ข้อร้องเรียนหรือไม่', options: { false: 'ไม่มี', true: 'มี' } },
  note: { title: 'หมายเหตุ' },
  reasonCodes: { title: 'เหตุผลที่ยอมรับสินค้า' },
} as const

/** True when any answer is abnormal; the note then becomes mandatory. */
export function hasAbnormalAnswer(answers: Pick<ReceiptAssessmentAnswers, 'productCondition' | 'documentation' | 'itemCorrectness' | 'coldChainApplicable' | 'coldChainCondition' | 'hasComplaint'>) {
  return answers.productCondition === 'abnormal'
    || answers.documentation === 'incomplete'
    || answers.itemCorrectness === 'problem'
    || (answers.coldChainApplicable === true && answers.coldChainCondition === 'inappropriate')
    || answers.hasComplaint === true
}

export type AssessmentIssue = { field: keyof ReceiptAssessmentAnswers; message: string }

export function assessmentIssues(answers: ReceiptAssessmentAnswers): AssessmentIssue[] {
  const issues: AssessmentIssue[] = []
  if (!answers.productCondition) issues.push({ field: 'productCondition', message: 'กรุณาระบุสภาพสินค้า/บรรจุภัณฑ์' })
  if (!answers.documentation) issues.push({ field: 'documentation', message: 'กรุณาระบุเอกสารประกอบ' })
  if (!answers.itemCorrectness) issues.push({ field: 'itemCorrectness', message: 'กรุณาระบุสินค้าที่ได้รับ' })
  if (answers.coldChainApplicable === null) issues.push({ field: 'coldChainApplicable', message: 'กรุณาระบุ Cold chain applicable' })
  if (answers.coldChainApplicable === true && !answers.coldChainCondition) issues.push({ field: 'coldChainCondition', message: 'กรุณาระบุสภาพ/อุณหภูมิ' })
  if (answers.hasComplaint === null) issues.push({ field: 'hasComplaint', message: 'กรุณาระบุว่ามีปัญหา/ข้อร้องเรียนหรือไม่' })
  if (hasAbnormalAnswer(answers)) {
    if (answers.reasonCodes.length === 0) issues.push({ field: 'reasonCodes', message: 'มีรายการผิดปกติ — กรุณาเลือกเหตุผลที่ยอมรับสินค้า' })
    if (answers.reasonCodes.includes('other') && !answers.otherReasonDetail.trim()) issues.push({ field: 'otherReasonDetail', message: 'กรุณาระบุรายละเอียดเหตุผลอื่น' })
    if (!answers.note.trim()) issues.push({ field: 'note', message: 'มีรายการผิดปกติ — กรุณาระบุหมายเหตุ' })
  }
  return issues
}

/** Normalises answers before saving: the temperature answer only exists when cold chain applies. */
export function normalizeAssessmentAnswers(answers: ReceiptAssessmentAnswers): ReceiptAssessmentAnswers {
  return {
    ...answers,
    coldChainCondition: answers.coldChainApplicable === true ? answers.coldChainCondition : null,
    note: answers.note.trim(),
    // Reasons only exist while something is abnormal; the detail only while "other" is chosen.
    reasonCodes: hasAbnormalAnswer(answers) ? [...new Set(answers.reasonCodes)] : [],
    otherReasonDetail: hasAbnormalAnswer(answers) && answers.reasonCodes.includes('other') ? answers.otherReasonDetail.trim() : '',
  }
}

export type ReceiptQuantityLine = {
  lineNo: number
  itemLabel: string
  unit: string
  receivedQty: number
  expectedQty: number | null
  cumulativeReceivedQty: number | null
}

export type ReceiptQuantitySummary = {
  lines: ReceiptQuantityLine[]
  totalReceivedLines: number
  linesWithExpected: number
  linesReachedExpected: number
  linesPartial: number
  linesOverExpected: number
}

/**
 * Quantity/completeness is read from the receipt, never asked again. Lines
 * without an expected quantity are reported as received-only and never enter
 * a completeness count.
 */
export function receiptQuantitySummary(lines: ReceiptQuantityLine[]): ReceiptQuantitySummary {
  const withExpected = lines.filter((line) => line.expectedQty != null && line.expectedQty > 0)
  const cumulative = (line: ReceiptQuantityLine) => line.cumulativeReceivedQty ?? line.receivedQty
  return {
    lines,
    totalReceivedLines: lines.length,
    linesWithExpected: withExpected.length,
    linesReachedExpected: withExpected.filter((line) => cumulative(line) >= (line.expectedQty ?? 0)).length,
    linesPartial: withExpected.filter((line) => cumulative(line) < (line.expectedQty ?? 0)).length,
    linesOverExpected: withExpected.filter((line) => cumulative(line) > (line.expectedQty ?? 0)).length,
  }
}
