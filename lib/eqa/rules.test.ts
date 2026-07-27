import { describe, expect, it } from 'vitest'
import { annualPlanReadiness, annualSummaryIssues, annualSummaryReadiness, missingPlannedRounds, plannedRoundDueDate, plannedRoundLabel, roundProgress, roundReceiptIssues, roundReceiptReadiness } from '@/lib/eqa/rules'
import type { EqaPlanItem, EqaRound } from '@/lib/eqa/types'

const item: EqaPlanItem = {
  id: 'item', planId: 'plan', schemeId: 'scheme', projectName: 'HIV RNA EQA', providerName: 'QCMD', sampleSetName: 'HIVRNA26', externalCode: null,
  testItem: 'HIV-VL', expectedRounds: 2, maintenanceBudget: true, tor: false, price: null, evaluationCriteria: 'Score 0-1 ผ่านเกณฑ์', equipmentName: 'COBAS 8800', note: null, sortOrder: 1,
  occurrences: [1, 2].map((plannedMonth) => ({ id: String(plannedMonth), planItemId: 'item', plannedMonth, responsibleUserId: null, responsibleName: null, responsibleCode: 'SJ', sortOrder: plannedMonth })),
}

const round = {
  id: 'round', planItemId: 'item', externalSentDate: '2026-01-01', sampleReceivedDate: '2026-01-02', packageCondition: 'acceptable', receivedTemperature: 'refrigerated',
  sampleCondition: 'acceptable', storageCondition: 'refrigerated', specimenType: 'Plasma', receiverId: 'user-1', analystId: 'user-2', analysisDate: '2026-01-03', submissionDate: '2026-01-04', submissionMethod: 'qcmd.org',
  results: [{ outcome: 'acceptable' }], summaryOutcome: 'pass', roundLabel: 'C1', status: 'evaluated', documentState: { documentType: 'round-receipt', entityId: 'round', revision: 1, status: 'approved' },
} as unknown as EqaRound

describe('EQA report readiness', () => {
  it('accepts a complete annual plan and receipt', () => {
    expect(annualPlanReadiness([item])).toEqual([])
    expect(roundReceiptReadiness(round)).toEqual([])
  })

  it('reports an occurrence count mismatch', () => {
    expect(annualPlanReadiness([{ ...item, occurrences: item.occurrences.slice(0, 1) }])).toContain('HIVRNA26: จำนวนเดือนที่วางแผนไม่ตรงกับ 2 ครั้ง')
  })

  it('requires closed CAPA for a failed annual-summary round', () => {
    const failed = { ...round, summaryOutcome: 'fail' as const }
    expect(annualSummaryReadiness(item, [failed, round], [])).toContain('C1: ผลไม่ผ่านแต่ยังไม่มี corrective action')
    expect(annualSummaryReadiness(item, [failed, round], [{ id: 'ca', roundId: 'round', status: 'closed' } as never])).toEqual([])
  })
})

describe('structured readiness targets (deep-linking)', () => {
  it('points each missing receipt field at that field on that round', () => {
    const issues = roundReceiptIssues({ ...round, analystId: null })
    const issue = issues.find((item) => item.message === 'ยังไม่ได้ระบุผู้ตรวจวิเคราะห์')
    expect(issue?.target).toEqual({ kind: 'receipt-field', roundId: 'round', field: 'analystId' })
  })

  it('points a missing-results issue at round-results, not a specific field', () => {
    const issues = roundReceiptIssues({ ...round, results: [] })
    const issue = issues.find((item) => item.message === 'ยังไม่มีรายการตัวอย่าง/ผลที่ส่ง')
    expect(issue?.target).toEqual({ kind: 'round-results', roundId: 'round' })
  })

  it('points a missing corrective action at the failed round', () => {
    const failed = { ...round, summaryOutcome: 'fail' as const }
    const issues = annualSummaryIssues(item, [failed], [])
    const issue = issues.find((entry) => entry.message.includes('ยังไม่มี corrective action'))
    expect(issue?.target).toEqual({ kind: 'corrective', roundId: 'round' })
  })

  it('points a missing evaluation-criteria issue at the plan item', () => {
    const issues = annualSummaryIssues({ ...item, evaluationCriteria: null }, [round], [])
    const issue = issues.find((entry) => entry.message === 'ยังไม่มีเกณฑ์การประเมิน')
    expect(issue?.target).toEqual({ kind: 'plan-item', planItemId: 'item' })
  })
})

describe('roundProgress', () => {
  it('marks every step done for a fully approved, evaluated, summarised round', () => {
    expect(roundProgress(round).every((step) => step.done)).toBe(true)
  })

  it('does not double-count "no results yet" as both a receipt gap and a results gap', () => {
    const steps = roundProgress({ ...round, results: [] })
    const receipt = steps.find((step) => step.key === 'receipt')
    const results = steps.find((step) => step.key === 'results')
    expect(receipt?.done).toBe(true)
    expect(results?.done).toBe(false)
    expect(results?.target).toEqual({ kind: 'round-results', roundId: 'round' })
  })

  it('treats a not-evaluated result as blocking the evaluated step even when status says evaluated', () => {
    const steps = roundProgress({ ...round, results: [{ outcome: 'not-evaluated' }] } as unknown as EqaRound)
    expect(steps.find((step) => step.key === 'evaluated')?.done).toBe(false)
  })

  it('flags an unapproved document as the last incomplete step', () => {
    const steps = roundProgress({ ...round, documentState: { ...round.documentState, status: 'draft' } })
    expect(steps.find((step) => step.key === 'approved')?.done).toBe(false)
  })
})

describe('plannedRoundLabel / plannedRoundDueDate', () => {
  it('labels rounds by sequence and Buddhist year', () => {
    expect(plannedRoundLabel(1, 2026)).toBe('ครั้งที่ 1/2569')
    expect(plannedRoundLabel(2, 2026)).toBe('ครั้งที่ 2/2569')
  })

  it('due-dates a round on the last day of its planned month', () => {
    expect(plannedRoundDueDate(2026, 1)).toBe('2026-01-31')
    expect(plannedRoundDueDate(2026, 2)).toBe('2026-02-28')
    expect(plannedRoundDueDate(2026, 12)).toBe('2026-12-31')
  })
})

describe('missingPlannedRounds', () => {
  it('generates one entry per occurrence not yet materialised as a round, continuing the sequence', () => {
    const missing = missingPlannedRounds(item, 0, 2026)
    expect(missing).toEqual([
      { sequence: 1, plannedMonth: 1, roundLabel: 'ครั้งที่ 1/2569', resultDueDate: '2026-01-31' },
      { sequence: 2, plannedMonth: 2, roundLabel: 'ครั้งที่ 2/2569', resultDueDate: '2026-02-28' },
    ])
  })

  it('skips occurrences already covered by existing rounds', () => {
    expect(missingPlannedRounds(item, 1, 2026)).toEqual([
      { sequence: 2, plannedMonth: 2, roundLabel: 'ครั้งที่ 2/2569', resultDueDate: '2026-02-28' },
    ])
  })

  it('returns nothing once every occurrence has a round', () => {
    expect(missingPlannedRounds(item, 2, 2026)).toEqual([])
  })
})
