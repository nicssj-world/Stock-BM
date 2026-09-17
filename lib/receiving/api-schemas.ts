import { z } from 'zod'

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()

export const vendorCreateSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(180),
  taxId: nullableText(80),
  address: nullableText(500),
  phone: nullableText(80),
  email: nullableText(180),
  contactPerson: nullableText(180),
  note: nullableText(1000),
})

export const vendorUpdateSchema = vendorCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD')
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

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
  source: z.enum(['manual', 'ocr']).optional(),
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
  source: z.enum(['manual', 'ocr', 'scan']).optional(),
  note: optionalText(2000),
  lines: z.array(receiptLineInputSchema).max(500).optional(),
})

export const receiptUpdateSchema = receiptCreateSchema.partial()
export const receiptLineUpdateSchema = receiptLineInputSchema.partial()
export const confirmReceiptSchema = z.object({})

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>
export type InvoiceLineUpdateInput = z.infer<typeof invoiceLineUpdateSchema>
export type ReceiptCreateInput = z.infer<typeof receiptCreateSchema>
export type ReceiptLineInput = z.infer<typeof receiptLineInputSchema>
export type ReceiptUpdateInput = z.infer<typeof receiptUpdateSchema>
export type ReceiptLineUpdateInput = z.infer<typeof receiptLineUpdateSchema>
