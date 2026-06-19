import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createRun } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  instrumentId: z.string().uuid().nullable().optional(),
  runNo: z.number().int().nullable().optional(),
  runDatetime: z.string().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  consumables: z
    .array(
      z.object({
        kind: z.enum(['staining-reagent', 'trucount-tube', 'mastermix', 'reagent', 'other']),
        lotNumber: z.string().trim().min(1).max(80),
        stockLotId: z.string().uuid().nullable().optional(),
        appliesScope: z.enum(['all', 'absolute-only']).optional(),
        beadCountPerTube: z.number().positive().nullable().optional(),
      }),
    )
    .optional(),
  values: z
    .array(
      z.object({
        controlLotId: z.string().uuid(),
        analyteId: z.string().uuid(),
        numericValue: z.number().nullable().optional(),
        qualitativeValue: z.string().trim().max(80).nullable().optional(),
      }),
    )
    .min(1),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await createRun(await readJson(request, schema), await requireActor()) }))
}
