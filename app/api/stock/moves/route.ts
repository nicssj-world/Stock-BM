import { z } from 'zod'
import { requireStockOperator } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { moveStock } from '@/lib/server/stock'

const schema = z.object({
  lotId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  quantity: z.number().positive(),
  reference: z.string().trim().max(180).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ stock: await moveStock(await readJson(request, schema), await requireStockOperator()) }))
}
