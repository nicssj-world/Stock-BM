import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteInstCompStudy, updateInstCompStudy } from '@/lib/server/instcomp'
import { readJson, respond } from '@/lib/server/route'
import { studySchema } from '@/lib/instcomp/schema'

const schema = studySchema.partial().extend({
  status: z.enum(['draft', 'in-progress', 'passed', 'failed', 'approved', 'rejected']).optional(),
  conclusion: z.string().trim().max(2000).nullable().optional(),
  samples: z
    .array(z.object({
      sampleLabel: z.string().trim().max(80).nullable().optional(),
      referenceRaw: z.string().trim().max(80).nullable().optional(),
      candidateRaw: z.string().trim().max(80).nullable().optional(),
      note: z.string().trim().max(300).nullable().optional(),
    }))
    .max(500)
    .optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await updateInstCompStudy((await params).id, await readJson(request, schema), await requireActor())
    return { ok: true }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await deleteInstCompStudy((await params).id, await requireActor())
    return { ok: true }
  })
}
