import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteRound, updateRound } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  status: z.enum(['scheduled', 'received', 'submitted', 'evaluated', 'closed']).optional(),
  submissionDate: z.string().trim().nullable().optional(),
  sampleReceivedDate: z.string().trim().nullable().optional(),
  resultDueDate: z.string().trim().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  roundLabel: z.string().trim().min(1).max(120).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await updateRound((await params).id, await readJson(request, schema), await requireActor()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { return respond(async () => ({ eqa: await deleteRound((await params).id, await requireActor()) })) }
