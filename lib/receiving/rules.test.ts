import { describe, expect, it } from 'vitest'
import type { Receipt, ReceiptLine } from '@/lib/receiving/types'
import { cumulativeReceived, deliveryCompleteness, deliveryLeadTimeDays, detectConflicts, receiptIssues, receiptReadiness } from '@/lib/receiving/rules'

const line = (overrides: Partial<ReceiptLine> = {}): ReceiptLine => ({
  id: 'line-1', receiptId: 'receipt-1', lineNo: 1, invoiceLineId: null, stockItemId: 'item-1', stockLotId: null,
  lotNumber: 'LOT-1', expiryDate: '2028-12-31', lotMode: 'new', locationId: 'location-1', expectedQty: 5,
  receivedQty: 5, barcodeRaw: null, barcodeSymbology: null, barcodeStandard: null, barcodeGtin: null, barcodeLot: null,
  barcodeExpiry: null, torThresholdMonths: 6, torExpiryCompliance: 'compliant', remainingShelfLifeDays: 900,
  receiptDecision: 'accepted', acceptanceReasonCode: null, acceptanceReasonNote: null, acceptedBy: null, acceptedAt: null,
  conflicts: [], sortOrder: 0, createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z', ...overrides,
})

const receipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: 'receipt-1', receiptNo: 'R-1', invoiceId: 'invoice-1', vendorId: 'vendor-1', receivedAt: '2027-01-01T00:00:00Z',
  receivedDate: '2027-01-01', receivedBy: 'actor-1', packagingStatus: 'acceptable', packagingNote: null,
  temperatureStatus: 'not_applicable', temperatureValueC: null, temperatureNote: null, coldChainApplicable: false,
  status: 'draft', stockTransactionId: null, confirmedAt: null, confirmedBy: null, source: 'manual', note: null,
  createdBy: 'actor-1', createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z', lines: [line()], ...overrides,
})

describe('receiving rules', () => {
  it('blocks missing lines, required packaging/temperature, unresolved conflicts, and incomplete exceptions', () => {
    expect(receiptReadiness(receipt({ lines: [] }))).toContain('ต้องมีรายการรับเข้าอย่างน้อย 1 รายการ')
    expect(receiptIssues(receipt({ packagingStatus: null }))).toContainEqual(expect.objectContaining({ target: 'packagingStatus' }))
    expect(receiptIssues(receipt({ temperatureStatus: null }))).toContainEqual(expect.objectContaining({ target: 'temperatureStatus' }))
    expect(receiptIssues(receipt({ lines: [line({ conflicts: [{ code: 'ambiguous' }] })] }))).toContainEqual(expect.objectContaining({ target: 'lines.0.conflicts' }))
    expect(receiptIssues(receipt({ lines: [line({ torExpiryCompliance: 'not_compliant' })] }))).toContainEqual(expect.objectContaining({ target: 'lines.0.receiptDecision' }))
    expect(receiptIssues(receipt({ lines: [line({ torExpiryCompliance: 'not_compliant', receiptDecision: 'accepted_with_justification', acceptanceReasonCode: 'other' })] }), { expiryExceptionEnabled: true })).toContainEqual(expect.objectContaining({ target: 'lines.0.acceptanceReasonNote' }))
  })

  it('keeps expiry compliance independent from the acceptance decision and never requires evidence', () => {
    const accepted = line({ torExpiryCompliance: 'not_compliant', receiptDecision: 'accepted_with_justification', acceptanceReasonCode: 'urgent_need' })
    expect(receiptIssues(receipt({ lines: [accepted] }))).not.toContainEqual(expect.objectContaining({ target: 'evidence' }))
    expect(receiptReadiness(receipt({ lines: [accepted] }))).not.toContain(expect.stringContaining('evidence'))
  })

  it('detects conflicts and calculates partial delivery against received quantities', () => {
    expect(detectConflicts([{ expectedQty: 3, receivedQty: 1 }, { expectedQty: 3, receivedQty: 1 }])).toEqual([])
    expect(detectConflicts([{ expectedQty: 3, receivedQty: 4 }])).toContainEqual(expect.objectContaining({ code: 'over_received' }))
    expect(cumulativeReceived([{ receivedQty: 3 }, { receivedQty: 2 }])).toBe(5)
    expect(deliveryCompleteness(5, 5)).toBe('complete')
    expect(deliveryCompleteness(3, 2)).toBe('open')
    expect(deliveryCompleteness(0, 5)).toBe('open')
  })

  it('keeps delivery lead time informational and returns null when dates are incomplete', () => {
    expect(deliveryLeadTimeDays('2027-01-01', '2027-01-04')).toBe(3)
    expect(deliveryLeadTimeDays(null, '2027-01-04')).toBeNull()
  })
})
