import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteEqaCorrectiveAction, updateEqaCorrectiveAction } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const patchSchema = z.object({
  problem: z.string().trim().min(1).max(1000).optional(),
  rootCause: z.string().trim().max(1000).nullable().optional(),
  actionTaken: z.string().trim().max(1000).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'No changes provided')

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await deleteEqaCorrectiveAction((await params).id, await requireActor()) }))
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await updateEqaCorrectiveAction((await params).id, await readJson(request, patchSchema), await requireActor()) }))
}
