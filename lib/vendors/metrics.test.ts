import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildVendorMetrics, type AssessmentEvidence } from './metrics'

const assessment = (overrides: Partial<AssessmentEvidence> = {}): AssessmentEvidence => ({
  id: 'assessment-1',
  receiptId: 'receipt-1',
  status: 'completed',
  productCondition: 'normal',
  documentation: 'complete',
  itemCorrectness: 'correct',
  coldChainApplicable: false,
  coldChainCondition: null,
  hasComplaint: false,
  ...overrides,
})

const base = {
  fiscalYear: '2027',
  shelfLife: [
    { id: 'rl-1', receiptId: 'receipt-1', compliance: 'compliant' as const },
    { id: 'rl-2', receiptId: 'receipt-2', compliance: 'not_compliant' as const },
    { id: 'rl-3', receiptId: 'receipt-3', compliance: 'not_applicable' as const },
  ],
  assessments: [
    assessment(),
    assessment({ id: 'assessment-2', receiptId: 'receipt-2', productCondition: 'abnormal', coldChainApplicable: true, coldChainCondition: 'inappropriate', hasComplaint: true }),
    assessment({ id: 'assessment-3', receiptId: 'receipt-3', status: 'pending', productCondition: null, documentation: null, itemCorrectness: null, coldChainApplicable: null, hasComplaint: null }),
  ],
  issues: [
    { id: 'issue-1', receiptId: null, issueType: 'complaint', resolutionStatus: 'resolved' as const, openedAt: '2026-10-01T00:00:00Z' },
    { id: 'issue-2', receiptId: 'receipt-1', issueType: 'documentation_discrepancy', resolutionStatus: 'open' as const, openedAt: '2027-09-30T00:00:00Z' },
  ],
  deliveryDates: [{ invoiceDate: '2026-10-01', receivedDate: '2026-10-03' }],
  coldChainMappingApproved: false,
}

describe('vendor metrics', () => {
  it('keeps open and cancelled obligations out of the Complete Delivery denominator', () => {
    const metrics = buildVendorMetrics({ ...base, completeDelivery: [
      { id: 'il-1', closureState: 'complete' },
      { id: 'il-2', closureState: 'short_closed' },
      { id: 'il-3', closureState: 'open' },
      { id: 'il-4', closureState: 'cancelled' },
    ] })
    expect(metrics.metrics.completeDelivery.numerator).toBe(1)
    expect(metrics.metrics.completeDelivery.denominator).toBe(2)
    expect(metrics.metrics.completeDelivery.excluded).toEqual([
      { reason: 'still_open', count: 1 },
      { reason: 'cancelled', count: 1 },
    ])
    expect(metrics.metrics.completeDelivery.provisional).toBe(true)
    expect(metrics.metrics.completeDelivery.sources.map((source) => source.id)).toEqual(['il-1', 'il-2'])
  })

  it('derives condition, documentation, item and complaint metrics from completed Receipt Assessments only', () => {
    const metrics = buildVendorMetrics({ ...base, completeDelivery: [] })
    expect(metrics.metrics.productCondition).toMatchObject({ numerator: 1, denominator: 2 })
    expect(metrics.metrics.productCondition.excluded).toEqual([{ reason: 'assessment_pending', count: 1 }])
    expect(metrics.metrics.documentationCompliance).toMatchObject({ numerator: 2, denominator: 2 })
    expect(metrics.metrics.itemCorrectness).toMatchObject({ numerator: 2, denominator: 2 })
    expect(metrics.metrics.assessmentComplaints).toMatchObject({ numerator: 1, denominator: null, display: 'count' })
    expect(metrics.source).toMatchObject({ assessmentsCompleted: 2, assessmentsPending: 1 })
  })

  it('counts cold chain only where the assessment says it applies, and keeps it provisional while P-12 is unapproved', () => {
    const metrics = buildVendorMetrics({ ...base, completeDelivery: [] })
    expect(metrics.metrics.coldChainCondition).toMatchObject({ numerator: 0, denominator: 1, provisional: true })
    expect(metrics.metrics.coldChainCondition.excluded).toContainEqual({ reason: 'cold_chain_not_applicable', count: 1 })
  })

  it('drills every flagged metric down to its source receipt / assessment / issue', () => {
    const metrics = buildVendorMetrics({ ...base, completeDelivery: [] })
    expect(metrics.metrics.productCondition.sources.filter((source) => source.flagged)).toEqual([{ kind: 'assessment', id: 'assessment-2', receiptId: 'receipt-2', flagged: true }])
    expect(metrics.metrics.shelfLifeCompliance.sources.filter((source) => source.flagged)).toEqual([{ kind: 'receipt_line', id: 'rl-2', receiptId: 'receipt-2', flagged: true }])
    expect(metrics.metrics.documentationDiscrepancies.sources).toEqual([{ kind: 'issue', id: 'issue-2', receiptId: 'receipt-1', flagged: true }])
  })

  it('reports quantity vs expected from receipt data as informational counts, never a ratio', () => {
    const metrics = buildVendorMetrics({ ...base, completeDelivery: [], quantityLines: [
      { id: 'il-1', expectedQty: 10, receivedQty: 10 },
      { id: 'il-2', expectedQty: 10, receivedQty: 8 },
      { id: 'il-3', expectedQty: 5, receivedQty: 0 },
      { id: 'il-4', expectedQty: 5, receivedQty: 6 },
    ] })
    expect(metrics.quantityVsExpected).toMatchObject({ linesWithExpected: 4, reachedExpected: 2, partiallyReceived: 1, notYetReceived: 1, overExpected: 1, informational: true })
    expect(metrics.quantityVsExpected).not.toHaveProperty('percent')
  })

  it('uses explicit applicable populations and leaves empty ratios null', () => {
    const metrics = buildVendorMetrics({ ...base, completeDelivery: [], shelfLife: [], assessments: [], issues: [], deliveryDates: [] })
    expect(metrics.metrics.shelfLifeCompliance.percent).toBeNull()
    expect(metrics.metrics.productCondition.percent).toBeNull()
    expect(metrics.metrics.coldChainCondition.percent).toBeNull()
    expect(metrics.metrics.complaintResolution.percent).toBeNull()
  })

  it('keeps lead time informational', () => {
    const metrics = buildVendorMetrics({ ...base, completeDelivery: [] })
    expect(metrics.deliveryLeadTime.informational).toBe(true)
    expect(metrics.deliveryLeadTime.label).toContain('ไม่ใช้คิดคะแนน')
  })

  it('does not expose due-date, late-attribution, or score inputs', () => {
    const source = JSON.stringify(buildVendorMetrics({ ...base, completeDelivery: [] }))
    expect(source).not.toMatch(/original_due_date|expected_delivery_date|late_|on_time/i)
    expect(source).not.toMatch(/score|weight|rank/i)
  })

  it('keeps forbidden scheduling identifiers and score code out of the metric implementation', () => {
    const source = readFileSync(join(process.cwd(), 'lib/vendors/metrics.ts'), 'utf8')
    expect(source).not.toMatch(/original_due_date|expected_delivery_date|late_|on_?time/i)
    expect(source).not.toMatch(/\b(score|weight|result|rank)\b/i)
    expect(source).toContain('deliveryLeadTime')
  })
})
