import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteIqcEntity, updateAnalyte } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  dataType: z.enum(['quantitative', 'qualitative']).optional(),
  scale: z.enum(['linear', 'log10']).optional(),
  isAbsolute: z.boolean().optional(),
  unit: z.string().nullable().optional(),
  groupLabel: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ iqc: await updateAnalyte((await params).id, await readJson(request, schema), await requireActor()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ iqc: await deleteIqcEntity('analyte', (await params).id, await requireActor()) }))
}
