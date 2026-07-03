import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createHpvDistribution } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  siteId: z.string().uuid(),
  distributedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lotId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().int().positive(),
  note: z.string().trim().max(500).nullable().optional(),
  overrideReason: z.string().trim().max(500).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await createHpvDistribution(await readJson(request, schema), await requireActor()) }))
}
