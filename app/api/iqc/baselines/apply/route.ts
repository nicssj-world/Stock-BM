import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { applyIqcBaseline } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  controlLotId: z.string().uuid(),
  analyteId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  includedResultIds: z.array(z.string().uuid()).optional(),
  exclusionReasons: z.record(z.string().uuid(), z.string().trim().max(500).nullable().optional()).optional(),
  reason: z.string().trim().min(1).max(1000),
  sourceRef: z.string().trim().max(500).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await applyIqcBaseline(await readJson(request, schema), await requireActor()) }))
}
