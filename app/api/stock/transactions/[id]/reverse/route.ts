import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { reverseStockTransaction } from '@/lib/server/stock'

const schema = z.object({ reason: z.string().trim().min(1).max(500) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    return { stock: await reverseStockTransaction((await params).id, (await readJson(request, schema)).reason, actor) }
  })
}

