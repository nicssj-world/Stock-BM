import { z } from 'zod'

export const vendorEvaluationJudgmentSchema = z.object({
  summary: z.string().trim().max(8000),
  strengths: z.string().trim().max(8000),
  risks: z.string().trim().max(8000),
  actions: z.string().trim().max(8000),
})

export const vendorEvaluationCreateSchema = z.object({
  vendorId: z.string().uuid(),
  fiscalYear: z.string().regex(/^\d{4}$/),
  judgment: vendorEvaluationJudgmentSchema,
})

export const vendorEvaluationUpdateSchema = z.object({
  judgment: vendorEvaluationJudgmentSchema,
})

export type VendorEvaluationJudgmentInput = z.infer<typeof vendorEvaluationJudgmentSchema>
export type VendorEvaluationCreateInput = z.infer<typeof vendorEvaluationCreateSchema>
