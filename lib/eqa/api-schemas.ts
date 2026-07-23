import { z } from 'zod'

export const eqaPlanItemSchema = z.object({
  planId: z.string().uuid(), schemeId: z.string().uuid(),
  projectName: z.string().trim().min(1).max(300), providerName: z.string().trim().min(1).max(200),
  sampleSetName: z.string().trim().min(1).max(200), externalCode: z.string().trim().max(160).nullable().optional(),
  testItem: z.string().trim().min(1).max(300), expectedRounds: z.number().int().positive().nullable().optional(),
  maintenanceBudget: z.boolean().optional(), tor: z.boolean().optional(), price: z.number().nonnegative().nullable().optional(),
  evaluationCriteria: z.string().trim().max(8000).nullable().optional(), equipmentName: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(), sortOrder: z.number().int().optional(),
  occurrences: z.array(z.object({ plannedMonth: z.number().int().min(1).max(12), responsibleUserId: z.string().uuid().nullable().optional(), responsibleCode: z.string().trim().min(1).max(12), sortOrder: z.number().int().optional() })).max(36).optional(),
})
