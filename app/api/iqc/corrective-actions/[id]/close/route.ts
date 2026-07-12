import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { closeCorrectiveAction } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  rootCause: z.string().trim().max(1000).nullable().optional(),
  actionTaken: z.string().trim().max(1000).nullable().optional(),
  effectivenessOutcome: z.enum(['effective', 'ineffective']).nullable().optional(),
  effectivenessNote: z.string().trim().max(1000).nullable().optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ iqc: await closeCorrectiveAction((await params).id, await readJson(request, schema), await requireActor()) }))
}
