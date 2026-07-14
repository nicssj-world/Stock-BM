import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { scanHpvSample } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  barcode: z.string().trim().min(1).max(180),
  boxId: z.string().uuid(),
  specimenType: z.enum(['self_collected', 'clinician_collected']),
  position: z.number().int().min(1).max(25).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await scanHpvSample(await readJson(request, schema), await requireActor()) }))
}
