import { requireStockOperator } from '@/lib/server/auth'
import { assertReceivingEnabled } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'
import { z } from 'zod'

const schema = z.object({ raw: z.string().min(1).max(4000), symbologyId: z.string().trim().max(120).nullable().optional() })

export async function POST(request: Request) {
  return respond(async () => {
    await requireStockOperator()
    await assertReceivingEnabled()
    const input = await readJson(request, schema)
    return { parsed: { raw: input.raw, symbologyId: input.symbologyId ?? null, itemId: null, lot: null, expiry: null, gtin: null } }
  })
}
