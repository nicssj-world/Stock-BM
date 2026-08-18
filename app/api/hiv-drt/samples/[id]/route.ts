import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteHivDrtSample, moveHivDrtSample, updateHivDrtOutlabLn } from '@/lib/server/hiv-drt'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  position: z.number().int().min(1).max(96).optional(),
  outlabLn: z.string().trim().max(180).nullable().optional(),
}).refine((input) => (input.position !== undefined) !== (input.outlabLn !== undefined), 'Exactly one sample update is required')

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const input = await readJson(request, schema)
    const actor = await requireActor()
    const id = (await params).id
    return { workspace: await (input.position !== undefined ? moveHivDrtSample(id, input.position, actor) : updateHivDrtOutlabLn(id, input.outlabLn ?? null, actor)) }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await deleteHivDrtSample((await params).id, await requireActor()) }))
}
