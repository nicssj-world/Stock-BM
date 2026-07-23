import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { receiveHivDrtResult, undoHivDrtResult } from '@/lib/server/hiv-drt'
import { readJson, respond } from '@/lib/server/route'

const undoSchema = z.object({ reason: z.string().trim().min(1, 'กรุณาระบุเหตุผล').max(500) })

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await receiveHivDrtResult((await params).id, await requireActor()) }))
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { reason } = await readJson(request, undoSchema)
    return { workspace: await undoHivDrtResult((await params).id, reason, await requireActor()) }
  })
}
