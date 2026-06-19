import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createEqaCorrectiveAction } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  roundId: z.string().uuid(),
  resultId: z.string().uuid().nullable().optional(),
  problem: z.string().trim().min(1).max(1000),
  rootCause: z.string().trim().max(1000).nullable().optional(),
  actionTaken: z.string().trim().max(1000).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ eqa: await createEqaCorrectiveAction(await readJson(request, schema), await requireActor()) }))
}
