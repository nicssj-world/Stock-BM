import { describe, expect, it } from 'vitest'
import { assessmentIssues, EMPTY_ASSESSMENT_ANSWERS, hasAbnormalAnswer, normalizeAssessmentAnswers, receiptQuantitySummary, type ReceiptAssessmentAnswers } from './assessment'
import { receiptAssessmentSchema } from './api-schemas'
import { searchItems } from './item-search'

const normal: ReceiptAssessmentAnswers = {
  productCondition: 'normal',
  documentation: 'complete',
  itemCorrectness: 'correct',
  coldChainApplicable: false,
  coldChainCondition: null,
  hasComplaint: false,
  note: '',
  reasonCodes: [],
  otherReasonDetail: '',
}

describe('Receipt Assessment rules', () => {
  it('has no quantity question — the schema rejects one', () => {
    expect(Object.keys(EMPTY_ASSESSMENT_ANSWERS)).not.toEqual(expect.arrayContaining([expect.stringMatching(/qty|quantity|จำนวน/i)]))
    expect(receiptAssessmentSchema.safeParse({ ...normal, receivedQty: 5 }).success).toBe(false)
    expect(receiptAssessmentSchema.safeParse({ ...normal, quantityComplete: true }).success).toBe(false)
    expect(receiptAssessmentSchema.safeParse(normal).success).toBe(true)
  })

  it('requires every question and does not require a note when all answers are normal', () => {
    expect(assessmentIssues(EMPTY_ASSESSMENT_ANSWERS).map((issue) => issue.field)).toEqual(['productCondition', 'documentation', 'itemCorrectness', 'coldChainApplicable', 'hasComplaint'])
    expect(assessmentIssues(normal)).toEqual([])
    expect(hasAbnormalAnswer(normal)).toBe(false)
  })

  it('asks the temperature condition only when cold chain applies', () => {
    expect(assessmentIssues({ ...normal, coldChainApplicable: true })).toEqual([expect.objectContaining({ field: 'coldChainCondition' })])
    expect(assessmentIssues({ ...normal, coldChainApplicable: true, coldChainCondition: 'appropriate' })).toEqual([])
    expect(normalizeAssessmentAnswers({ ...normal, coldChainApplicable: false, coldChainCondition: 'inappropriate' }).coldChainCondition).toBeNull()
  })

  it.each([
    ['product damaged', { productCondition: 'abnormal' as const }],
    ['documents incomplete', { documentation: 'incomplete' as const }],
    ['wrong item', { itemCorrectness: 'problem' as const }],
    ['cold chain inappropriate', { coldChainApplicable: true, coldChainCondition: 'inappropriate' as const }],
    ['complaint', { hasComplaint: true }],
  ])('requires reasons and a note when %s', (_label, patch) => {
    const answers = { ...normal, ...patch }
    expect(hasAbnormalAnswer(answers)).toBe(true)
    expect(assessmentIssues(answers).map((issue) => issue.field)).toEqual(['reasonCodes', 'note'])
    expect(assessmentIssues({ ...answers, note: 'กล่องบุบ 1 กล่อง' }).map((issue) => issue.field)).toEqual(['reasonCodes'])
    expect(assessmentIssues({ ...answers, note: 'กล่องบุบ 1 กล่อง', reasonCodes: ['usable_condition'] })).toEqual([])
  })

  it('needs the detail when the reason is "other", and drops reasons once every answer is normal', () => {
    const abnormal = { ...normal, productCondition: 'abnormal' as const, note: 'กล่องบุบ', reasonCodes: ['other' as const] }
    expect(assessmentIssues(abnormal).map((issue) => issue.field)).toEqual(['otherReasonDetail'])
    expect(assessmentIssues({ ...abnormal, otherReasonDetail: 'รอเอกสาร' })).toEqual([])
    const corrected = normalizeAssessmentAnswers({ ...abnormal, productCondition: 'normal', otherReasonDetail: 'รอเอกสาร' })
    expect(corrected.reasonCodes).toEqual([])
    expect(corrected.otherReasonDetail).toBe('')
    expect(normalizeAssessmentAnswers({ ...abnormal, otherReasonDetail: ' รอเอกสาร ', reasonCodes: ['other', 'other'] })).toMatchObject({ reasonCodes: ['other'], otherReasonDetail: 'รอเอกสาร' })
  })

  it('derives quantity completeness from receipt lines instead of asking', () => {
    const summary = receiptQuantitySummary([
      { lineNo: 1, itemLabel: 'A', unit: 'box', receivedQty: 8, expectedQty: 10, cumulativeReceivedQty: 8 },
      { lineNo: 2, itemLabel: 'B', unit: 'box', receivedQty: 2, expectedQty: 10, cumulativeReceivedQty: 10 },
      { lineNo: 3, itemLabel: 'C', unit: 'kit', receivedQty: 3, expectedQty: null, cumulativeReceivedQty: null },
    ])
    expect(summary).toMatchObject({ totalReceivedLines: 3, linesWithExpected: 2, linesReachedExpected: 1, linesPartial: 1, linesOverExpected: 0 })
  })
})

describe('Item Master lookup', () => {
  const items = [
    { id: '1', itemCode: 'CHEM-TPUC3', name: 'cobas TPUC3', unit: 'box', catalogNo: '08058679190', manufacturer: 'Roche' },
    { id: '2', itemCode: 'CHEM-ALB', name: 'Albumin Gen.2', unit: 'box', catalogNo: '08058679100', manufacturer: 'Roche' },
    { id: '3', itemCode: 'HIV-VL', name: 'HIV viral load kit', unit: 'kit', catalogNo: '06693016190', manufacturer: 'Roche' },
  ]

  it('ranks an exact Catalog/REF first, ignoring punctuation', () => {
    expect(searchItems(items, '080-586-79190').map((item) => item.id)[0]).toBe('1')
    expect(searchItems(items, '0805867').map((item) => item.id).sort()).toEqual(['1', '2'])
  })

  it('searches name, item code and manufacturer', () => {
    expect(searchItems(items, 'viral load').map((item) => item.id)).toEqual(['3'])
    expect(searchItems(items, 'chem-alb').map((item) => item.id)).toEqual(['2'])
    expect(searchItems(items, 'roche tpuc3').map((item) => item.id)).toEqual(['1'])
  })

  it('does not match a GTIN to any Catalog/REF', () => {
    expect(searchItems(items, '07613336121535')).toEqual([])
  })
})
