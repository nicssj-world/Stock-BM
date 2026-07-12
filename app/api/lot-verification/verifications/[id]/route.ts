import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteVerification, updateVerification } from '@/lib/server/lotverif'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  status: z.enum(['draft', 'in-progress', 'passed', 'failed', 'released', 'rejected']).optional(),
  conclusion: z.string().trim().max(2000).nullable().optional(),
  acceptanceCriteria: z.string().trim().max(1000).nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  method: z.enum(['parallel-comparison', 'qc-acceptance', 'patient-comparison']).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await updateVerification((await params).id, await readJson(request, schema), await requireActor())
    return { ok: true }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await deleteVerification((await params).id, await requireActor())
    return { ok: true }
  })
}
