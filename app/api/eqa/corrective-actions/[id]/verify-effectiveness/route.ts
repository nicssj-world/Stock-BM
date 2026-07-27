import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { verifyEqaCorrectiveActionEffectiveness } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  outcome: z.enum(['effective', 'ineffective']),
  note: z.string().trim().min(1).max(1000),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await verifyEqaCorrectiveActionEffectiveness((await params).id, await readJson(request, schema), await requireActor()) }))
}
