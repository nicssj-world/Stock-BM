import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteHivDrtSample, moveHivDrtSample, updateHivDrtOutlabLn, updateHivDrtWard } from '@/lib/server/hiv-drt'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  position: z.number().int().min(1).max(96).optional(),
  outlabLn: z.string().trim().max(180).nullable().optional(),
  ward: z.string().trim().max(180).nullable().optional(),
}).refine((input) => [input.position, input.outlabLn, input.ward].filter((value) => value !== undefined).length === 1, 'Exactly one sample update is required')

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const input = await readJson(request, schema)
    const actor = await requireActor()
    const id = (await params).id
    return { workspace: await (input.position !== undefined ? moveHivDrtSample(id, input.position, actor) : input.ward !== undefined ? updateHivDrtWard(id, input.ward, actor) : updateHivDrtOutlabLn(id, input.outlabLn ?? null, actor)) }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await deleteHivDrtSample((await params).id, await requireActor()) }))
}
