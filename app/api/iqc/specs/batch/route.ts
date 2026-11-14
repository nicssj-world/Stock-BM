import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { upsertSpecsBatch } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  controlLotId: z.string().uuid(),
  changeReason: z.string().trim().max(300).nullable().optional(),
  items: z.array(z.object({
    analyteId: z.string().uuid(),
    assignedMean: z.number(),
    assignedSd: z.number().positive(),
  })).min(1).max(100),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await upsertSpecsBatch(await readJson(request, schema), await requireActor()) }))
}
