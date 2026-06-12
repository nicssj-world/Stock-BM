import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { createLocation } from '@/lib/server/stock'

const schema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  storageCondition: z.string().trim().max(120).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ stock: await createLocation(await readJson(request, schema), await requireStockAdmin()) }))
}

