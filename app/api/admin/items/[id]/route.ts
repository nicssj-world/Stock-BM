import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { updateItem } from '@/lib/server/stock'

const itemSchema = z.object({
  itemCode: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(180).optional(),
  categoryId: z.string().uuid().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  minimumStock: z.number().min(0).optional(),
  expiryWarningDays: z.number().int().min(0).max(3650).optional(),
  defaultIssueQty: z.number().positive().nullable().optional(),
  storageCondition: z.string().trim().max(120).nullable().optional(),
  supplier: z.string().trim().max(180).nullable().optional(),
  catalogNo: z.string().trim().max(120).nullable().optional(),
  manufacturer: z.string().trim().max(120).nullable().optional(),
  manufacturerBarcode: z.string().trim().max(180).nullable().optional(),
  trackLot: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ stock: await updateItem((await params).id, await readJson(request, itemSchema), await requireStockAdmin()) }))
}

