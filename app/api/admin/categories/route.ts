import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { createCategory } from '@/lib/server/stock'

const schema = z.object({ name: z.string().trim().min(1).max(120) })

export async function POST(request: Request) {
  return respond(async () => ({ stock: await createCategory((await readJson(request, schema)).name, await requireStockAdmin()) }))
}

