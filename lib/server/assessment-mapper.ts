import type { ReceiptAssessment } from '@/lib/receiving/assessment'

type RecordRow = Record<string, unknown>

const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const nullableString = (value: unknown) => (typeof value === 'string' ? value : null)

/** bm_receipt_assessments row -> app shape (shared by the receiving and vendor modules). */
export function toAssessment(row: RecordRow): ReceiptAssessment {
  return {
    id: asString(row.id),
    receiptId: asString(row.receipt_id),
    vendorId: asString(row.vendor_id),
    status: asString(row.status) === 'completed' ? 'completed' : 'pending',
    productCondition: nullableString(row.product_condition) as ReceiptAssessment['productCondition'],
    documentation: nullableString(row.documentation) as ReceiptAssessment['documentation'],
    itemCorrectness: nullableString(row.item_correctness) as ReceiptAssessment['itemCorrectness'],
    coldChainApplicable: row.cold_chain_applicable == null ? null : Boolean(row.cold_chain_applicable),
    coldChainCondition: nullableString(row.cold_chain_condition) as ReceiptAssessment['coldChainCondition'],
    hasComplaint: row.has_complaint == null ? null : Boolean(row.has_complaint),
    note: nullableString(row.note),
    reasonCodes: (Array.isArray(row.reason_codes) ? row.reason_codes : []) as ReceiptAssessment['reasonCodes'],
    otherReasonDetail: nullableString(row.other_reason_detail),
    acceptanceDecision: nullableString(row.acceptance_decision) as ReceiptAssessment['acceptanceDecision'],
    assessedBy: nullableString(row.assessed_by),
    assessedAt: nullableString(row.assessed_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}
