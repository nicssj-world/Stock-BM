import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { addMeasurements } from '@/lib/server/lotverif'
import { readJson, respond } from '@/lib/server/route'

const rowSchema = z.object({
  analyteId: z.string().uuid().nullable().optional(),
  analyteLabel: z.string().trim().max(160).nullable().optional(),
  sampleLabel: z.string().trim().max(160).nullable().optional(),
  oldValue: z.number().nullable().optional(),
  newValue: z.number().nullable().optional(),
  oldQualitative: z.string().trim().max(80).nullable().optional(),
  newQualitative: z.string().trim().max(80).nullable().optional(),
  acceptancePercent: z.number().nullable().optional(),
})

const schema = z.object({
  verificationId: z.string().uuid(),
  rows: z.array(rowSchema).min(1).max(100),
})

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request, schema)
    await addMeasurements(body.verificationId, body.rows, await requireActor())
    return { ok: true }
  })
}
