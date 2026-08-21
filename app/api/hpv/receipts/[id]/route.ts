import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { deleteHpvReceipt, updateHpvReceipt } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const patchSchema = z.object({
  receivedOn: z.string().optional(),
  sampleCount: z.number().int().min(1).optional(),
  selfSupplied: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

const deleteSchema = z.object({
  reason: z.string().trim().min(1).max(500),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const input = await readJson(request, patchSchema)
    return { workspace: await updateHpvReceipt({ id: (await params).id, ...input }, await requireStockAdmin()) }
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { reason } = await readJson(request, deleteSchema)
    return { workspace: await deleteHpvReceipt((await params).id, reason, await requireStockAdmin()) }
  })
}
