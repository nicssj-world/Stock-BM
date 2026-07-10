import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { lockControlLotStatistics, unlockControlLotStatistics } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const lockSchema = z.object({
  controlLotId: z.string().uuid(),
  overrideReason: z.string().trim().max(300).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => {
    const { controlLotId, overrideReason } = await readJson(request, lockSchema)
    return { iqc: await lockControlLotStatistics(controlLotId, await requireActor(), overrideReason) }
  })
}

const unlockSchema = z.object({
  controlLotId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
})

export async function DELETE(request: Request) {
  return respond(async () => {
    const { controlLotId, reason } = await readJson(request, unlockSchema)
    return { iqc: await unlockControlLotStatistics(controlLotId, reason, await requireActor()) }
  })
}
