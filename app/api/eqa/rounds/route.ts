import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createRound } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  planItemId: z.string().uuid(),
  roundLabel: z.string().trim().min(1).max(80),
  sampleReceivedDate: z.string().trim().nullable().optional(),
  resultDueDate: z.string().trim().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ eqa: await createRound(await readJson(request, schema), await requireActor()) }))
}
