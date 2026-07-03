import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { deleteHpvSample, moveHpvSamplePosition } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const patchSchema = z.object({
  position: z.number().int().min(1).max(25),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { position } = await readJson(request, patchSchema)
    return { workspace: await moveHpvSamplePosition((await params).id, position, await requireStockAdmin()) }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await deleteHpvSample((await params).id, await requireStockAdmin()) }))
}
