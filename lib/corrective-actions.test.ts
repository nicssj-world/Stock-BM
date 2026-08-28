import { describe, expect, it } from 'vitest'
import {
  reviewCategoriesFor,
  validateCorrectiveAction,
  type CorrectiveActionDraft,
} from '@/lib/corrective-actions'

function completeDraft(module: 'iqc' | 'eqa'): CorrectiveActionDraft {
  return {
    problem: 'ผลควบคุมคุณภาพผิดปกติ',
    issueTypes: ['result-out-of-control'],
    probableErrorType: 'systematic',
    probableErrorNote: '',
    reviewFindings: Object.fromEntries(reviewCategoriesFor(module).map((category) => [category.key, { status: 'normal' as const, note: null }])) as CorrectiveActionDraft['reviewFindings'],
    rootCause: 'ทบทวนแล้วพบว่าน้ำยาหมดอายุ',
    actionTypes: ['new-reagent-bottle-or-lot'],
    actionTaken: 'เปลี่ยนน้ำยา lot ใหม่และทำ control ซ้ำ',
    correctionOutcome: 'corrected',
    correctionOutcomeNote: '',
    preventiveAction: 'เพิ่มจุดตรวจสอบวันหมดอายุใน checklist ก่อนเริ่มงาน',
    ownerId: '',
    dueDate: '',
  }
}

describe('structured corrective action validation', () => {
  it('requires every displayed checklist category to be explicitly reviewed', () => {
    const draft = completeDraft('iqc')
    expect(validateCorrectiveAction(draft, 'iqc', 'complete')).toEqual([])

    draft.reviewFindings['westgard-rules'] = { status: 'not-reviewed', note: null }
    expect(validateCorrectiveAction(draft, 'iqc', 'complete').some((issue) => issue.field === 'reviewFindings.westgard-rules')).toBe(true)
  })

  it('requires evidence for abnormal and not-applicable checklist statuses', () => {
    const draft = completeDraft('eqa')
    draft.reviewFindings['provider-evaluation'] = { status: 'abnormal', note: null }
    expect(validateCorrectiveAction(draft, 'eqa', 'complete').some((issue) => issue.field === 'reviewFindings.provider-evaluation.note')).toBe(true)

    draft.reviewFindings['provider-evaluation'] = { status: 'not-applicable', note: 'ไม่มีค่า assigned value จากผู้จัดในรอบนี้' }
    expect(validateCorrectiveAction(draft, 'eqa', 'complete')).toEqual([])
  })

  it('allows an incomplete draft to be saved but not completed', () => {
    const draft = completeDraft('iqc')
    draft.rootCause = ''
    expect(validateCorrectiveAction(draft, 'iqc', 'draft')).toEqual([])
    expect(validateCorrectiveAction(draft, 'iqc', 'complete').some((issue) => issue.field === 'rootCause')).toBe(true)
  })
})
