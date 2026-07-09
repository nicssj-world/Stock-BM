import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteIqcEntity, updateControlMaterial } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  name: z.string().min(1).optional(),
  level: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  stockItemId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ iqc: await updateControlMaterial((await params).id, await readJson(request, schema), await requireActor()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ iqc: await deleteIqcEntity('material', (await params).id, await requireActor()) }))
}
