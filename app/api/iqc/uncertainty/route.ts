import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { saveUncertaintyBudget } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  analyteId: z.string().uuid(),
  measurand: z.string().trim().min(1).max(160),
  concentration: z.number().positive(),
  coverageK: z.number().positive().optional(),
  components: z
    .array(
      z.object({
        source: z.enum(['calibrator', 'eqas', 'other']),
        label: z.string().trim().max(120).nullable().optional(),
        value: z.number().nonnegative(),
        distribution: z.enum(['normal', 'normal-k2', 'rectangular', 'triangular', 'u-shape']),
        concentration: z.number().positive(),
      }),
    )
    .optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await saveUncertaintyBudget(await readJson(request, schema), await requireActor()) }))
}
