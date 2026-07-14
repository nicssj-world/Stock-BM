import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { checkoutHpvSample } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  barcode: z.string().trim().min(1).max(180),
  destination: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  specimenType: z.enum(['self_collected', 'clinician_collected']).optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await checkoutHpvSample(await readJson(request, schema), await requireActor()) }))
}
