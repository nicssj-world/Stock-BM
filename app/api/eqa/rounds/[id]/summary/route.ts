import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { updateRoundSummary } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ summaryOutcome: z.enum(['pass', 'fail', 'not-evaluated']), summaryNote: z.string().trim().max(3000).nullable().optional() })
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await updateRoundSummary((await params).id, await readJson(request, schema), await requireActor()) }))
}
