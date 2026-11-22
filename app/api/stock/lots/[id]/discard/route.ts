import { z } from 'zod'
import { requireStockOperator } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { discardExpiredLot } from '@/lib/server/stock'

const schema = z.object({ note: z.string().trim().max(500).nullable().optional() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const lotId = z.string().uuid().parse((await params).id)
    return await discardExpiredLot(lotId, await readJson(request, schema), await requireStockOperator())
  })
}
