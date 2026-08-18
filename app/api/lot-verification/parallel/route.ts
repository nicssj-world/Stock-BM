import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { saveParallelMeasurements } from '@/lib/server/lotverif'
import { readJson, respond } from '@/lib/server/route'

const value = z.number().finite().nullable().optional()
const rowSchema = z.object({
  level: z.number().int().min(1).max(3),
  controlLotId: z.string().uuid().nullable().optional(),
  controlLabel: z.string().trim().max(160).nullable().optional(),
  controlMean: value,
  controlSd: value,
  oldRun1: value,
  oldRun2: value,
  newRun1: value,
  newRun2: value,
})

const schema = z.object({
  verificationId: z.string().uuid(),
  rows: z.array(rowSchema).min(1).max(3),
})

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request, schema)
    await saveParallelMeasurements(body.verificationId, body.rows, await requireActor())
    return { ok: true }
  })
}
