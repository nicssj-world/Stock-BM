import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { updateHpvReceipt } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const patchSchema = z.object({
  receivedOn: z.string().optional(),
  sampleCount: z.number().int().min(1).optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const input = await readJson(request, patchSchema)
    return { workspace: await updateHpvReceipt({ id: (await params).id, ...input }, await requireStockAdmin()) }
  })
}
