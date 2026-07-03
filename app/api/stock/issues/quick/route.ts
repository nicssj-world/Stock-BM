import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { quickIssueByCode } from '@/lib/server/stock'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ code: z.string().trim().min(1).max(500) })

export async function POST(request: Request) {
  return respond(async () => await quickIssueByCode((await readJson(request, schema)).code, await requireActor()))
}
