import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createHpvReceipt } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  siteId: z.string().uuid(),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sampleCount: z.number().int().positive(),
  selfSupplied: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await createHpvReceipt(await readJson(request, schema), await requireActor()) }))
}
