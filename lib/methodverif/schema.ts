import { z } from 'zod'

const raw = z.string().trim().max(60)
const optionalNumber = z.number().finite().nullable()

export const precisionSchema = z.object({
  days: z.number().int().min(2).max(40),
  replicates: z.number().int().min(2).max(10),
  levels: z.array(z.object({
    label: z.string().trim().min(1).max(60),
    claimRepeatability: optionalNumber,
    claimWithinLab: optionalNumber,
    values: z.array(z.array(raw).max(10)).max(40),
  })).max(6),
})

export const lodSchema = z.object({
  claimedLod: optionalNumber,
  minReplicates: z.number().int().min(1).max(200),
  minDetectPercent: z.number().min(1).max(100),
  values: z.array(raw).max(200),
})

export const linearitySchema = z.object({
  limit: z.number().finite().positive(),
  points: z.array(z.object({ expected: optionalNumber, values: z.array(raw).max(10) })).max(20),
})

export const comparisonSchema = z.object({
  referenceLabel: z.string().trim().max(120),
  biasLimit: z.number().finite().positive(),
  pairLimit: z.number().finite().positive(),
  minPairs: z.number().int().min(2).max(500),
  samples: z.array(z.object({ sampleLabel: z.string().trim().max(80), referenceRaw: raw, candidateRaw: raw })).max(500),
})

const sections = z.array(z.enum(['precision', 'lod', 'linearity', 'comparison'])).min(1)

export const createMethodVerifSchema = z.object({
  title: z.string().trim().min(1).max(200),
  testName: z.string().trim().min(1).max(120),
  analyteId: z.string().uuid().nullable().optional(),
  instrumentId: z.string().uuid(),
  scale: z.enum(['linear', 'log10']),
  unit: z.string().trim().max(40).nullable().optional(),
  requiredSections: sections,
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  referenceLabel: z.string().trim().max(120).nullable().optional(),
})

export const updateMethodVerifSchema = createMethodVerifSchema.partial().extend({
  precision: precisionSchema.optional(),
  lod: lodSchema.optional(),
  linearity: linearitySchema.optional(),
  comparison: comparisonSchema.optional(),
  status: z.enum(['draft', 'in-progress', 'passed', 'failed', 'approved', 'rejected']).optional(),
  conclusion: z.string().trim().max(3000).nullable().optional(),
})

export type CreateMethodVerifInput = z.infer<typeof createMethodVerifSchema>
export type UpdateMethodVerifInput = z.infer<typeof updateMethodVerifSchema>
