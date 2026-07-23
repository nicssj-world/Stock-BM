import { z } from 'zod'
import { requireStockOperator } from '@/lib/server/auth'
import { resolveIssueContext } from '@/lib/server/stock'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ code: z.string().trim().min(1).max(500) })

export async function POST(request: Request) {
  return respond(async () => ({ context: await resolveIssueContext((await readJson(request, schema)).code, await requireStockOperator()) }))
}
