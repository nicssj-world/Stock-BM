export type CorrectiveModule = 'iqc' | 'eqa'

export type CorrectiveReviewStatus = 'not-reviewed' | 'normal' | 'abnormal' | 'not-applicable'
export type CorrectiveErrorType = 'random' | 'systematic' | 'unknown' | 'other'
export type CorrectiveCorrectionOutcome = 'corrected' | 'not-corrected' | 'monitoring' | 'other'

export type CorrectiveReviewCategoryKey =
  | 'control-material'
  | 'reagent-consumable'
  | 'calibration'
  | 'instrument-maintenance'
  | 'procedure-sample'
  | 'personnel'
  | 'storage-environment'
  | 'trend-history'
  | 'westgard-rules'
  | 'package-sample'
  | 'provider-evaluation'
  | 'submission-entry'

export interface CorrectiveReviewFinding {
  status: CorrectiveReviewStatus
  note: string | null
}

export type CorrectiveReviewFindings = Partial<Record<CorrectiveReviewCategoryKey, CorrectiveReviewFinding>>

export interface CorrectiveActionDraft {
  problem: string
  issueTypes: string[]
  probableErrorType: CorrectiveErrorType
  probableErrorNote: string
  reviewFindings: CorrectiveReviewFindings
  rootCause: string
  actionTypes: string[]
  actionTaken: string
  correctionOutcome: CorrectiveCorrectionOutcome | ''
  correctionOutcomeNote: string
  preventiveAction: string
  ownerId: string
  dueDate: string
}

// API payloads may carry null for legacy/cleared values. Keep this separate
// from the UI draft, where empty strings make progressive form editing easier.
export interface CorrectiveActionFields {
  problem?: string | null
  issueTypes?: string[] | null
  probableErrorType?: CorrectiveErrorType | null
  probableErrorNote?: string | null
  reviewFindings?: Record<string, unknown> | null
  rootCause?: string | null
  actionTypes?: string[] | null
  actionTaken?: string | null
  correctionOutcome?: CorrectiveCorrectionOutcome | null
  correctionOutcomeNote?: string | null
  preventiveAction?: string | null
  ownerId?: string | null
  dueDate?: string | null
}

export interface CorrectiveValidationIssue {
  field: string
  message: string
}

export interface CorrectiveReviewCategory {
  key: CorrectiveReviewCategoryKey
  label: string
  helper?: string
  modules?: CorrectiveModule[]
}

export const REVIEW_STATUS_OPTIONS: Array<{ value: CorrectiveReviewStatus; label: string }> = [
  { value: 'not-reviewed', label: 'ยังไม่ทบทวน' },
  { value: 'normal', label: 'ปกติ' },
  { value: 'abnormal', label: 'ผิดปกติ' },
  { value: 'not-applicable', label: 'ไม่เกี่ยวข้อง' },
]

export const ERROR_TYPE_OPTIONS: Array<{ value: CorrectiveErrorType; label: string }> = [
  { value: 'random', label: 'Random error' },
  { value: 'systematic', label: 'Systematic error' },
  { value: 'unknown', label: 'ยังระบุไม่ได้' },
  { value: 'other', label: 'อื่น ๆ' },
]

export const CORRECTION_OUTCOME_OPTIONS: Array<{ value: CorrectiveCorrectionOutcome; label: string }> = [
  { value: 'corrected', label: 'แก้ไขแล้ว (Corrected)' },
  { value: 'not-corrected', label: 'ยังแก้ไขไม่ได้ (Not corrected)' },
  { value: 'monitoring', label: 'อยู่ระหว่างติดตาม (Monitoring)' },
  { value: 'other', label: 'อื่น ๆ' },
]

export const COMMON_REVIEW_CATEGORIES: CorrectiveReviewCategory[] = [
  { key: 'control-material', label: 'Control / Material', helper: 'Lot, สภาพ และการจัดเตรียมวัสดุควบคุม' },
  { key: 'reagent-consumable', label: 'Reagent / Consumable', helper: 'Lot, อายุการใช้งาน ขวดใหม่ และการเก็บรักษา' },
  { key: 'calibration', label: 'Calibration / Measurement system', helper: 'Calibration, calibrator และค่าที่ใช้วัด' },
  { key: 'instrument-maintenance', label: 'Instrument / Maintenance', helper: 'การบำรุงรักษา สภาพเครื่อง และการทำงานผิดปกติ' },
  { key: 'procedure-sample', label: 'Procedure / Sample handling', helper: 'SOP, การเตรียมตัวอย่าง และขั้นตอนการทดสอบ' },
  { key: 'personnel', label: 'Personnel / Competency', helper: 'การฝึกอบรมและการปฏิบัติตาม SOP' },
  { key: 'storage-environment', label: 'Storage / Environment', helper: 'อุณหภูมิ สภาพแวดล้อม และการขนส่งที่เกี่ยวข้อง' },
]

export const MODULE_REVIEW_CATEGORIES: Record<CorrectiveModule, CorrectiveReviewCategory[]> = {
  iqc: [
    { key: 'trend-history', label: 'Previous trend / history', helper: 'แนวโน้มผลย้อนหลังและช่วง ±SD' },
    { key: 'westgard-rules', label: 'Westgard / rule review', helper: 'Rule ที่ระบบแจ้งและการตีความผล' },
  ],
  eqa: [
    { key: 'package-sample', label: 'Package / sample condition', helper: 'สภาพห่อ ตัวอย่าง และอุณหภูมิที่เกี่ยวข้อง' },
    { key: 'provider-evaluation', label: 'Provider evaluation / assigned value', helper: 'ผลประเมิน ค่าอ้างอิง และคะแนนจากผู้จัด' },
    { key: 'submission-entry', label: 'Submission / result entry', helper: 'การบันทึกผล การทวนสอบ และวิธีส่งผล' },
  ],
}

export const ISSUE_TYPE_OPTIONS: Array<{ value: string; label: string; modules?: CorrectiveModule[] }> = [
  { value: 'result-out-of-control', label: 'ผลอยู่นอกเกณฑ์ควบคุม' },
  { value: 'below-minus-2sd', label: 'ผลต่ำกว่า -2SD', modules: ['iqc'] },
  { value: 'above-plus-2sd', label: 'ผลสูงกว่า +2SD', modules: ['iqc'] },
  { value: 'trend-or-shift', label: 'พบแนวโน้ม / Shift', modules: ['iqc'] },
  { value: 'westgard-rule', label: 'พบ Westgard rule', modules: ['iqc'] },
  { value: 'eqa-warning', label: 'EQA Warning', modules: ['eqa'] },
  { value: 'eqa-unacceptable', label: 'EQA Unacceptable', modules: ['eqa'] },
  { value: 'other', label: 'อื่น ๆ' },
]

export const ACTION_TYPE_OPTIONS: Array<{ value: string; label: string; modules?: CorrectiveModule[] }> = [
  { value: 'repeat-control-or-retest', label: 'ทำ Control ซ้ำ / Retest' },
  { value: 'fresh-control', label: 'ใช้ Control ชุดใหม่' },
  { value: 'retest-eqa', label: 'ทดสอบ EQA ซ้ำ', modules: ['eqa'] },
  { value: 'change-control-lot', label: 'เปลี่ยน Control lot', modules: ['iqc'] },
  { value: 'new-reagent-bottle-or-lot', label: 'เปลี่ยน Reagent ขวดหรือ lot ใหม่' },
  { value: 'recalibrate', label: 'Calibrate ใหม่' },
  { value: 'replace-calibrator', label: 'เปลี่ยน Calibrator' },
  { value: 'instrument-maintenance', label: 'บำรุงรักษา / แก้ไขเครื่องมือ' },
  { value: 'equipment-handling', label: 'ทบทวนการใช้งานอุปกรณ์' },
  { value: 'hold-eqa-sample', label: 'พักการรายงาน/ส่งผล EQA จนกว่าผลจะผ่าน', modules: ['eqa'] },
  { value: 'other', label: 'อื่น ๆ' },
]

export function reviewCategoriesFor(module: CorrectiveModule) {
  return [...COMMON_REVIEW_CATEGORIES, ...MODULE_REVIEW_CATEGORIES[module]]
}

export function createEmptyReviewFindings(module: CorrectiveModule, source: CorrectiveReviewFindings = {}): CorrectiveReviewFindings {
  const result: CorrectiveReviewFindings = {}
  for (const category of reviewCategoriesFor(module)) {
    const finding = source[category.key]
    result[category.key] = {
      status: finding?.status ?? 'not-reviewed',
      note: finding?.note ?? null,
    }
  }
  return result
}

export function normalizeReviewFindings(value: unknown, module: CorrectiveModule): CorrectiveReviewFindings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const result: CorrectiveReviewFindings = {}
  for (const category of reviewCategoriesFor(module)) {
    const raw = source[category.key]
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const status = row.status
    result[category.key] = {
      status: status === 'normal' || status === 'abnormal' || status === 'not-applicable' ? status : 'not-reviewed',
      note: typeof row.note === 'string' ? row.note : null,
    }
  }
  return result
}

export function validateCorrectiveAction(draft: Partial<CorrectiveActionDraft>, module: CorrectiveModule, intent: 'draft' | 'complete'): CorrectiveValidationIssue[] {
  const issues: CorrectiveValidationIssue[] = []
  if (!draft.problem?.trim()) issues.push({ field: 'problem', message: 'ระบุปัญหาที่พบก่อนบันทึก' })
  if (intent === 'draft') return issues

  if (!draft.issueTypes?.length) issues.push({ field: 'issueTypes', message: 'เลือกประเภทปัญหาอย่างน้อย 1 รายการ' })
  if (!draft.probableErrorType) issues.push({ field: 'probableErrorType', message: 'ระบุประเภทสาเหตุที่คาดการณ์' })
  if (draft.probableErrorType === 'other' && !draft.probableErrorNote?.trim()) issues.push({ field: 'probableErrorNote', message: 'ระบุรายละเอียดของสาเหตุประเภทอื่น ๆ' })

  for (const category of reviewCategoriesFor(module)) {
    const finding = draft.reviewFindings?.[category.key]
    if (!finding || finding.status === 'not-reviewed') {
      issues.push({ field: `reviewFindings.${category.key}`, message: `ทบทวนหมวด ${category.label} และเลือกสถานะ` })
    } else if ((finding.status === 'abnormal' || finding.status === 'not-applicable') && !finding.note?.trim()) {
      issues.push({ field: `reviewFindings.${category.key}.note`, message: `ระบุหมายเหตุ/เหตุผลสำหรับหมวด ${category.label}` })
    }
  }

  if (!draft.rootCause?.trim()) issues.push({ field: 'rootCause', message: 'ระบุ Root cause ก่อนส่งตรวจ/ปิดงาน' })
  if (!draft.actionTypes?.length) issues.push({ field: 'actionTypes', message: 'เลือกการแก้ไขอย่างน้อย 1 รายการ' })
  if (!draft.actionTaken?.trim()) issues.push({ field: 'actionTaken', message: 'ระบุรายละเอียดการแก้ไข' })
  if (!draft.correctionOutcome) issues.push({ field: 'correctionOutcome', message: 'ระบุผลการแก้ไขทันที' })
  if ((draft.correctionOutcome === 'monitoring' || draft.correctionOutcome === 'other') && !draft.correctionOutcomeNote?.trim()) {
    issues.push({ field: 'correctionOutcomeNote', message: 'ระบุรายละเอียดเพิ่มเติมของผลการแก้ไข' })
  }
  if (!draft.preventiveAction?.trim()) issues.push({ field: 'preventiveAction', message: 'ระบุแนวทางป้องกันการเกิดซ้ำ' })
  return issues
}

export function hasStructuredCorrectiveDetails(action: Partial<CorrectiveActionDraft>, module: CorrectiveModule) {
  return validateCorrectiveAction(action, module, 'complete').length === 0
}

export function issueOptionsFor(module: CorrectiveModule) {
  return ISSUE_TYPE_OPTIONS.filter((option) => !option.modules || option.modules.includes(module))
}

export function actionOptionsFor(module: CorrectiveModule) {
  return ACTION_TYPE_OPTIONS.filter((option) => !option.modules || option.modules.includes(module))
}
