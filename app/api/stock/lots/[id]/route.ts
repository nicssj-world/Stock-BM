import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { updateStockLot } from '@/lib/server/stock'

const schema = z.object({
  lotNumber: z.string().trim().min(1).max(120),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reason: z.string().trim().min(1).max(500),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const { id } = await params
    const lotId = z.string().uuid().parse(id)
    const input = await readJson(request, schema)
    return { stock: await updateStockLot(lotId, input, await requireStockAdmin()) }
  })
}
