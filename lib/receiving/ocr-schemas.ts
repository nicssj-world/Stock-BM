import { z } from 'zod'

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()

export const invoiceOcrDraftLineSchema = z.object({
  lineNo: z.number().int().min(1).max(100),
  sourceText: z.string().trim().min(1).max(2000),
  catalogNoText: nullableText(180),
  lotText: nullableText(180),
  expiryText: nullableText(80),
  expectedQty: z.number().finite().positive(),
  stockItemId: z.string().uuid().nullable().optional(),
  matchMethod: z.enum(['exact_unique', 'exact_ambiguous', 'similar', 'unmatched']),
  matchConfidence: z.number().finite().min(0).max(1).nullable().optional(),
  candidateItemIds: z.array(z.string().uuid()).max(50).default([]),
})

export const invoiceOcrDraftSchema = z.object({
  vendorId: z.string().uuid(),
  invoiceNo: nullableText(120),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  rawText: z.string().trim().min(1).max(100000),
  engine: z.string().trim().min(1).max(120),
  engineVersion: nullableText(80),
  languages: z.string().trim().min(1).max(40).default('tha+eng'),
  confidence: z.number().finite().min(0).max(100).nullable().optional(),
  lines: z.array(invoiceOcrDraftLineSchema).max(100),
})

export type InvoiceOcrDraftInput = z.infer<typeof invoiceOcrDraftSchema>
