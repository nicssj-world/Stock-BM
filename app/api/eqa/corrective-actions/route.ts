import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createEqaCorrectiveAction } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  roundId: z.string().uuid(),
  resultId: z.string().uuid().nullable().optional(),
  problem: z.string().trim().min(1).max(1000),
  issueTypes: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  probableErrorType: z.enum(['random', 'systematic', 'unknown', 'other']).nullable().optional(),
  probableErrorNote: z.string().trim().max(2000).nullable().optional(),
  reviewFindings: z.record(z.string(), z.object({ status: z.enum(['not-reviewed', 'normal', 'abnormal', 'not-applicable']), note: z.string().trim().max(2000).nullable().optional() })).nullable().optional(),
  rootCause: z.string().trim().max(1000).nullable().optional(),
  actionTypes: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  actionTaken: z.string().trim().max(1000).nullable().optional(),
  correctionOutcome: z.enum(['corrected', 'not-corrected', 'monitoring', 'other']).nullable().optional(),
  correctionOutcomeNote: z.string().trim().max(2000).nullable().optional(),
  preventiveAction: z.string().trim().max(2000).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ eqa: await createEqaCorrectiveAction(await readJson(request, schema), await requireActor()) }))
}
