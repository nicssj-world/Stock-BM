import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createCorrectiveAction } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  runId: z.string().uuid(),
  analyteId: z.string().uuid().nullable().optional(),
  relatedConsumableId: z.string().uuid().nullable().optional(),
  problem: z.string().trim().min(1).max(1000),
  rootCause: z.string().trim().max(1000).nullable().optional(),
  actionTaken: z.string().trim().max(1000).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await createCorrectiveAction(await readJson(request, schema), await requireActor()) }))
}
