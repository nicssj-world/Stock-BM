import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteResult, updateResult } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  analyte: z.string().trim().min(1).max(120),
  submittedValue: z.string().trim().max(120).nullable().optional(),
  evaluationScore: z.number().nullable().optional(),
  outcome: z.enum(['acceptable', 'warning', 'unacceptable', 'not-evaluated']),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await updateResult((await params).id, await readJson(request, schema), await requireActor()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await deleteResult((await params).id, await requireActor()) }))
}
