import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { adjustStock } from '@/lib/server/stock'

const schema = z.object({
  lotId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().refine((value) => value !== 0, 'Adjustment quantity must not be zero'),
  reference: z.string().trim().max(180).nullable().optional(),
  note: z.string().trim().min(1).max(500),
})

export async function POST(request: Request) {
  return respond(async () => ({ stock: await adjustStock(await readJson(request, schema), await requireStockAdmin()) }))
}

