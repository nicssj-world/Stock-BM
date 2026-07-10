import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { lockLabStatistics, unlockLabStatistics } from '@/lib/server/iqc'
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

const unlockSchema = z.object({
  controlLotId: z.string().uuid(),
  analyteId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
})

export async function DELETE(request: Request) {
  return respond(async () => {
    const { controlLotId, analyteId, reason } = await readJson(request, unlockSchema)
    return { iqc: await unlockLabStatistics(controlLotId, analyteId, reason, await requireActor()) }
  })
}
