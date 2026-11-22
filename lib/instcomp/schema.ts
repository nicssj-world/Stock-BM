import { z } from 'zod'

export const studySchema = z.object({
  title: z.string().trim().min(1).max(200),
  testName: z.string().trim().min(1).max(120),
  analyteId: z.string().uuid().nullable().optional(),
  scale: z.enum(['linear', 'log10']),
  unit: z.string().trim().max(40).nullable().optional(),
  referenceInstrumentId: z.string().uuid().nullable().optional(),
  referenceLabel: z.string().trim().max(120).nullable().optional(),
  candidateInstrumentId: z.string().uuid().nullable().optional(),
  candidateLabel: z.string().trim().max(120).nullable().optional(),
  biasLimit: z.number().finite().positive(),
  pairLimit: z.number().finite().positive(),
  minPairs: z.number().int().min(2).max(500),
  performedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})
