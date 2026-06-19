import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { lockLabStatistics } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  controlLotId: z.string().uuid(),
  analyteId: z.string().uuid(),
  overrideReason: z.string().trim().max(300).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => {
    const { controlLotId, analyteId, overrideReason } = await readJson(request, schema)
    return { iqc: await lockLabStatistics(controlLotId, analyteId, await requireActor(), overrideReason) }
  })
}
