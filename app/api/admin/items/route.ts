import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { createItem } from '@/lib/server/stock'

const itemSchema = z.object({
  itemCode: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(180),
  categoryId: z.string().uuid(),
  unit: z.string().trim().min(1).max(40),
  minimumStock: z.number().min(0),
  expiryWarningDays: z.number().int().min(0).max(3650),
  storageCondition: z.string().trim().max(120).nullable().optional(),
  supplier: z.string().trim().max(180).nullable().optional(),
  catalogNo: z.string().trim().max(120).nullable().optional(),
  manufacturer: z.string().trim().max(120).nullable().optional(),
  manufacturerBarcode: z.string().trim().max(180).nullable().optional(),
  trackLot: z.boolean(),
  trackExpiry: z.boolean(),
})

export async function POST(request: Request) {
  return respond(async () => ({ stock: await createItem(await readJson(request, itemSchema), await requireStockAdmin()) }))
}

