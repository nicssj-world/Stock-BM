import { z } from 'zod'
import { requireStockOperator } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { receiveStock } from '@/lib/server/stock'

const schema = z.object({
  itemId: z.string().uuid(),
  lotNumber: z.string().trim().max(120).nullable().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  quantity: z.number().positive(),
  locationId: z.string().uuid(),
  supplier: z.string().trim().max(180).nullable().optional(),
  reference: z.string().trim().max(180).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  manufacturerBarcode: z.string().trim().max(180).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ stock: await receiveStock(await readJson(request, schema), await requireStockOperator()) }))
}
