import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteHivDrtSample, moveHivDrtSample } from '@/lib/server/hiv-drt'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ position: z.number().int().min(1).max(96) })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { position } = await readJson(request, schema)
    return { workspace: await moveHivDrtSample((await params).id, position, await requireActor()) }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await deleteHivDrtSample((await params).id, await requireActor()) }))
}
