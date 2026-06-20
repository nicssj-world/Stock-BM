import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createVerification } from '@/lib/server/lotverif'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  subjectKind: z.enum(['reagent-lot', 'control-lot']),
  title: z.string().trim().max(200).nullable().optional(),
  method: z.enum(['parallel-comparison', 'qc-acceptance', 'patient-comparison']),
  acceptanceCriteria: z.string().trim().max(1000).nullable().optional(),
  newStockLotId: z.string().uuid().nullable().optional(),
  oldStockLotId: z.string().uuid().nullable().optional(),
  newControlLotId: z.string().uuid().nullable().optional(),
  oldControlLotId: z.string().uuid().nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ id: await createVerification(await readJson(request, schema), await requireActor()) }))
}
