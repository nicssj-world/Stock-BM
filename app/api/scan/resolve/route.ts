import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { resolveScan } from '@/lib/server/stock'

const schema = z.object({ code: z.string().trim().min(1).max(500) })

export async function POST(request: Request) {
  return respond(async () => {
    await requireActor()
    return { result: await resolveScan((await readJson(request, schema)).code) }
  })
}

