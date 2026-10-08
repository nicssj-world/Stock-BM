import { z } from 'zod'

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

export const vendorCreateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  legalName: nullableText(300),
  taxId: z.string().trim().regex(/^[0-9]{13}$/, 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก').nullable().optional().or(z.literal('')),
  taxBranchCode: z.string().trim().regex(/^[0-9]{5}$/, 'รหัสสาขาต้องเป็นตัวเลข 5 หลัก').nullable().optional().or(z.literal('')),
  address: nullableText(500),
  phone: nullableText(80),
  email: z.string().trim().max(180).refine((value) => !value || value.includes('@'), 'รูปแบบอีเมลไม่ถูกต้อง').nullable().optional(),
  contactPerson: nullableText(180),
  note: nullableText(1000),
})

export const vendorUpdateSchema = vendorCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
  // The updated_at the form was loaded with: the database rejects the save if someone else changed the vendor since.
  expectedUpdatedAt: z.string().optional(),
  deactivateNote: z.string().trim().max(1000).optional(),
})

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>

export const vendorIssueCreateSchema = z.object({
  issueType: z.enum(['packaging_damage', 'documentation_discrepancy', 'temperature_out_of_range', 'complaint', 'quantity_discrepancy', 'expiry_non_compliant', 'item_discrepancy', 'other']),
  description: z.string().trim().min(1).max(4000),
  receiptId: z.string().uuid().nullable().optional(),
  invoiceId: z.string().uuid().nullable().optional(),
})

// Resolving an open issue needs an action and a note; cancelling needs a reason (and a note when the reason is "other").
export const vendorIssueUpdateSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('resolve'),
    resolutionAction: z.enum(['vendor_replaced_goods', 'vendor_supplied_documents', 'vendor_clarified_accepted', 'credit_note_received', 'verified_no_impact', 'vendor_warned', 'other']),
    note: z.string().trim().min(1, 'กรุณาระบุรายละเอียดการแก้ไข').max(2000),
  }),
  z.object({
    action: z.literal('cancel'),
    reason: z.enum(['duplicate', 'opened_in_error', 'other']),
    note: z.string().trim().max(2000).nullable().optional(),
  }),
])

export type VendorIssueCreateInput = z.infer<typeof vendorIssueCreateSchema>
export type VendorIssueUpdateInput = z.infer<typeof vendorIssueUpdateSchema>

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD')
export const invoiceLineInputSchema = z.object({
  lineNo: z.number().int().min(1).max(10000),
  stockItemId: z.string().uuid().nullable().optional(),
  catalogNoText: optionalText(180),
  descriptionText: optionalText(500),
  expectedQty: z.number().positive(),
  lotText: optionalText(180),
  expiryText: optionalText(80),
  matchMethod: z.enum(['exact_unique', 'exact_ambiguous', 'similar', 'manual', 'unmatched']).nullable().optional(),
  matchConfidence: z.number().finite().nullable().optional(),
  closureState: z.enum(['open', 'complete', 'short_closed', 'cancelled']).optional(),
  shortReasonCode: optionalText(80),
  shortReasonNote: optionalText(1000),
  sortOrder: z.number().int().min(0).max(10000).optional(),
})

export const invoiceCreateSchema = z.object({
  vendorId: z.string().uuid(),
  invoiceNo: optionalText(120),
  invoiceDate: isoDate.nullable().optional(),
  status: z.enum(['draft', 'open']).optional(),
  source: z.enum(['manual']).optional(),
  note: optionalText(2000),
  lines: z.array(invoiceLineInputSchema).max(500).optional(),
})

export const invoiceUpdateSchema = invoiceCreateSchema.partial().extend({
  status: z.enum(['draft', 'open', 'closed', 'cancelled']).optional(),
})
export const invoiceLineUpdateSchema = invoiceLineInputSchema.partial()

export const receiptLineInputSchema = z.object({
  lineNo: z.number().int().min(1).max(10000),
  invoiceLineId: z.string().uuid().nullable().optional(),
  stockItemId: z.string().uuid(),
  stockLotId: z.string().uuid().nullable().optional(),
  lotNumber: optionalText(180),
  expiryDate: isoDate.nullable().optional(),
  lotMode: z.enum(['existing', 'new', 'not_tracked']).optional(),
  locationId: z.string().uuid(),
  expectedQty: z.number().positive().nullable().optional(),
  receivedQty: z.number().positive(),
  barcodeRaw: optionalText(1000),
  barcodeSymbology: optionalText(80),
  barcodeStandard: optionalText(80),
  barcodeGtin: optionalText(180),
  barcodeLot: optionalText(180),
  barcodeExpiry: isoDate.nullable().optional(),
  barcodeAdditionalProductId: optionalText(180),
  barcodeManufactureDate: isoDate.nullable().optional(),
  barcodeBestBefore: isoDate.nullable().optional(),
  barcodeSerial: optionalText(180),
  torExpiryCompliance: z.enum(['compliant', 'not_compliant', 'not_applicable']).optional(),
  remainingShelfLifeDays: z.number().int().nullable().optional(),
  receiptDecision: z.enum(['accepted', 'accepted_with_justification']).optional(),
  acceptanceReasonCode: z.enum(['urgent_need', 'consume_before_expiry', 'no_alternative', 'approved_by_authority', 'other']).nullable().optional(),
  acceptanceReasonNote: optionalText(2000),
  conflicts: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
})

export const receiptCreateSchema = z.object({
  receiptNo: optionalText(120),
  invoiceId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid(),
  receivedAt: z.string().datetime({ offset: true }).optional(),
  receivedDate: isoDate.optional(),
  packagingStatus: z.enum(['acceptable', 'damaged', 'not_applicable']).nullable().optional(),
  packagingNote: optionalText(2000),
  temperatureStatus: z.enum(['acceptable', 'out_of_range', 'not_applicable']).nullable().optional(),
  temperatureValueC: z.number().finite().nullable().optional(),
  temperatureNote: optionalText(2000),
  coldChainApplicable: z.boolean().optional(),
  source: z.enum(['manual', 'scan']).optional(),
  note: optionalText(2000),
  lines: z.array(receiptLineInputSchema).max(500).optional(),
})

export const receiptUpdateSchema = receiptCreateSchema.partial()
export const receiptLineUpdateSchema = receiptLineInputSchema.partial()
export const confirmReceiptSchema = z.object({})

// No quantity field: completeness is derived from the receipt lines.
export const receiptAssessmentSchema = z.object({
  productCondition: z.enum(['normal', 'abnormal']),
  documentation: z.enum(['complete', 'incomplete']),
  itemCorrectness: z.enum(['correct', 'problem']),
  coldChainApplicable: z.boolean(),
  coldChainCondition: z.enum(['appropriate', 'inappropriate']).nullable().optional(),
  hasComplaint: z.boolean(),
  note: z.string().trim().max(4000).nullable().optional(),
  reasonCodes: z.array(z.enum(['urgent_need', 'no_alternative', 'usable_condition', 'vendor_will_correct', 'documentation_pending', 'consume_before_expiry', 'approved_exception', 'other'])).max(8).default([]),
  otherReasonDetail: z.string().trim().max(1000).nullable().optional(),
}).strict()

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>
export type InvoiceLineUpdateInput = z.infer<typeof invoiceLineUpdateSchema>
export type ReceiptCreateInput = z.infer<typeof receiptCreateSchema>
export type ReceiptLineInput = z.infer<typeof receiptLineInputSchema>
export type ReceiptUpdateInput = z.infer<typeof receiptUpdateSchema>
export type ReceiptLineUpdateInput = z.infer<typeof receiptLineUpdateSchema>
export type ReceiptAssessmentInput = z.infer<typeof receiptAssessmentSchema>
