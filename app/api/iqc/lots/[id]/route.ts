import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteControlLot, updateControlLot } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ isActive: z.boolean() })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ iqc: await updateControlLot((await params).id, await readJson(request, schema), await requireActor()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ iqc: await deleteControlLot((await params).id, await requireActor()) }))
}
