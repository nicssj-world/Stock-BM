import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { closeEqaCorrectiveAction } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  rootCause: z.string().trim().max(1000).nullable().optional(),
  actionTaken: z.string().trim().max(1000).nullable().optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await closeEqaCorrectiveAction((await params).id, await readJson(request, schema), await requireActor()) }))
}
