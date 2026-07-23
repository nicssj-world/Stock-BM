import { describe, expect, it } from 'vitest'
import { annualPlanReadiness, annualSummaryReadiness, roundReceiptReadiness } from '@/lib/eqa/rules'
import type { EqaPlanItem, EqaRound } from '@/lib/eqa/types'

const item: EqaPlanItem = {
  id: 'item', planId: 'plan', schemeId: 'scheme', projectName: 'HIV RNA EQA', providerName: 'QCMD', sampleSetName: 'HIVRNA26', externalCode: null,
  testItem: 'HIV-VL', expectedRounds: 2, maintenanceBudget: true, tor: false, price: null, evaluationCriteria: 'Score 0-1 ผ่านเกณฑ์', equipmentName: 'COBAS 8800', note: null, sortOrder: 1,
  occurrences: [1, 2].map((plannedMonth) => ({ id: String(plannedMonth), planItemId: 'item', plannedMonth, responsibleUserId: null, responsibleName: null, responsibleCode: 'SJ', sortOrder: plannedMonth })),
}

const round = {
  id: 'round', planItemId: 'item', externalSentDate: '2026-01-01', sampleReceivedDate: '2026-01-02', packageCondition: 'acceptable', receivedTemperature: 'refrigerated',
  sampleCondition: 'acceptable', storageCondition: 'refrigerated', specimenType: 'Plasma', receiverId: 'user-1', analystId: 'user-2', analysisDate: '2026-01-03', submissionDate: '2026-01-04', submissionMethod: 'qcmd.org',
  results: [{ outcome: 'acceptable' }], summaryOutcome: 'pass', roundLabel: 'C1', status: 'evaluated',
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
