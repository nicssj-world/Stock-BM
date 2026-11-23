import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { saveRoundResults } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

// Saves every edited and new sample result of one round at once: the whole
// result table is filled in on screen and submitted with one request.
const row = z.object({
  id: z.string().uuid().optional(),
  analyte: z.string().trim().min(1).max(120),
  sampleCode: z.string().trim().min(1).max(120),
  submittedValue: z.string().trim().min(1).max(120),
  unit: z.string().trim().max(40).nullable().optional(),
  ctValue: z.number().finite().nullable().optional(),
  evaluationScore: z.number().finite().nullable().optional(),
  outcome: z.enum(['acceptable', 'warning', 'unacceptable', 'not-evaluated']),
  iqcAnalyteId: z.string().uuid().nullable().optional(),
  assignedValue: z.string().trim().max(120).nullable().optional(),
}).strict()
const schema = z.object({ results: z.array(row).min(1).max(200) }).strict()

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await saveRoundResults((await params).id, (await readJson(request, schema)).results, await requireActor()) }))
}
