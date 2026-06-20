import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { saveCorrectiveAction } from '@/lib/server/environment'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  readingId: z.string().uuid(),
  problem: z.string().trim().min(1).max(500),
  rootCause: z.string().trim().max(1000).nullable().optional(),
  actionTaken: z.string().trim().max(1000).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ id: await saveCorrectiveAction(await readJson(request, schema), await requireActor()) }))
}
