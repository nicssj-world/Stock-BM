import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteCorrectiveAction, updateCorrectiveAction } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const patchSchema = z.object({
  problem: z.string().trim().min(1).max(1000).optional(),
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
}).refine((value) => Object.keys(value).length > 0, 'No changes provided')

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ iqc: await deleteCorrectiveAction((await params).id, await requireActor()) }))
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ iqc: await updateCorrectiveAction((await params).id, await readJson(request, patchSchema), await requireActor()) }))
}
