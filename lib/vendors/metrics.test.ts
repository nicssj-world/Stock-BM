import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildVendorMetrics } from './metrics'

const base = {
  fiscalYear: '2027',
  shelfLife: [
    { compliance: 'compliant' as const },
    { compliance: 'not_compliant' as const },
    { compliance: 'not_applicable' as const },
  ],
  receipts: [
    { status: 'confirmed' as const, packagingStatus: 'acceptable' as const, temperatureStatus: 'acceptable' as const, coldChainApplicable: true },
    { status: 'confirmed' as const, packagingStatus: 'not_applicable' as const, temperatureStatus: 'not_applicable' as const, coldChainApplicable: false },
  ],
  issues: [
    { issueType: 'complaint', resolutionStatus: 'resolved' as const, openedAt: '2026-10-01T00:00:00Z' },
    { issueType: 'documentation_discrepancy', resolutionStatus: 'open' as const, openedAt: '2027-09-30T00:00:00Z' },
  ],
  deliveryDates: [{ invoiceDate: '2026-10-01', receivedDate: '2026-10-03' }],
  coldChainMappingApproved: false,
}

describe('vendor metrics', () => {
  it('keeps open and cancelled obligations out of the Complete Delivery denominator', () => {
    const result = buildVendorMetrics({ ...base, completeDelivery: [
      { closureState: 'complete' },
      { closureState: 'short_closed' },
      { closureState: 'open' },
      { closureState: 'cancelled' },
    ] })
    expect(result.metrics.completeDelivery.numerator).toBe(1)
    expect(result.metrics.completeDelivery.denominator).toBe(2)
    expect(result.metrics.completeDelivery.excluded).toEqual([
      { reason: 'still_open', count: 1 },
      { reason: 'cancelled', count: 1 },
    ])
    expect(result.metrics.completeDelivery.provisional).toBe(true)
  })

  it('uses explicit applicable populations and leaves empty ratios null', () => {
    const result = buildVendorMetrics({ ...base, completeDelivery: [], shelfLife: [], receipts: [], issues: [], deliveryDates: [] })
    expect(result.metrics.shelfLifeCompliance.percent).toBeNull()
    expect(result.metrics.packagingCompliance.percent).toBeNull()
    expect(result.metrics.temperatureCompliance.percent).toBeNull()
    expect(result.metrics.complaintResolution.percent).toBeNull()
  })

  it('marks P-12 temperature evidence provisional and keeps lead time informational', () => {
    const result = buildVendorMetrics({ ...base, completeDelivery: [] })
    expect(result.metrics.temperatureCompliance.provisional).toBe(true)
    expect(result.deliveryLeadTime.informational).toBe(true)
    expect(result.deliveryLeadTime.label).toContain('ไม่ใช้คิดคะแนน')
  })

  it('does not expose due-date, late-attribution, or score inputs', () => {
    const source = JSON.stringify(buildVendorMetrics({ ...base, completeDelivery: [] }))
    expect(source).not.toMatch(/original_due_date|expected_delivery_date|late_/i)
    expect(source).not.toMatch(/score|weight/i)
  })

  it('keeps forbidden scheduling identifiers and score code out of Phase 3 implementation files', () => {
    const source = readFileSync(join(process.cwd(), 'lib/vendors/metrics.ts'), 'utf8')
    expect(source).not.toMatch(/original_due_date|expected_delivery_date|late_/i)
    expect(source).not.toMatch(/\b(score|weight|result)\b/i)
    expect(source).toContain('deliveryLeadTime')
  })
})
