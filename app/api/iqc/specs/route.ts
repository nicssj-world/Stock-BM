import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { upsertSpec } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  controlLotId: z.string().uuid(),
  analyteId: z.string().uuid(),
  assignedMean: z.number().nullable().optional(),
  assignedSd: z.number().min(0).nullable().optional(),
  expectedQualitative: z.string().trim().max(80).nullable().optional(),
  changeReason: z.string().trim().max(300).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await upsertSpec(await readJson(request, schema), await requireActor()) }))
}
