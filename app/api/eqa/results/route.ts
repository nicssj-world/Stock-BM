import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createResult } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  roundId: z.string().uuid(),
  analyte: z.string().trim().min(1).max(120),
  sampleCode: z.string().trim().max(120).nullable().optional(),
  submittedValue: z.string().trim().max(120).nullable().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  ctValue: z.number().finite().nullable().optional(),
  evaluationScore: z.number().nullable().optional(),
  outcome: z.enum(['acceptable', 'warning', 'unacceptable', 'not-evaluated']),
  iqcAnalyteId: z.string().uuid().nullable().optional(),
  assignedValue: z.number().finite().nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ eqa: await createResult(await readJson(request, schema), await requireActor()) }))
}
