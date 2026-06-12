import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { issueStock } from '@/lib/server/stock'

const schema = z.object({
  lotId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().positive(),
  purpose: z.string().trim().min(1).max(180),
  reference: z.string().trim().max(180).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  overrideReason: z.string().trim().max(500).nullable().optional(),
  expiredConfirmed: z.boolean(),
})

export async function POST(request: Request) {
  return respond(async () => ({ stock: await issueStock(await readJson(request, schema), await requireActor()) }))
}

