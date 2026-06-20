import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { issueBatch } from '@/lib/server/stock'
import { readJson, respond } from '@/lib/server/route'

const lineSchema = z.object({
  lotId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().positive(),
  expiredConfirmed: z.boolean().optional(),
  overrideReason: z.string().trim().max(500).nullable().optional(),
})

const schema = z.object({
  lines: z.array(lineSchema).min(1).max(100),
  purpose: z.string().trim().min(1).max(180),
  reference: z.string().trim().max(180).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => await issueBatch(await readJson(request, schema), await requireActor()))
}
