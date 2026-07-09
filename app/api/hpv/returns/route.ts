import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createHpvKitReturn } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  siteId: z.string().uuid(),
  returnedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).nullable().optional(),
  lines: z.array(z.object({
    distributionId: z.string().uuid(),
    distributionLineId: z.string().uuid(),
    lotId: z.string().uuid(),
    locationId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
})

export async function POST(request: Request) {
  return respond(async () => createHpvKitReturn(await readJson(request, schema), await requireActor()))
}
