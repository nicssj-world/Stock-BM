import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createProvider } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ name: z.string().trim().min(1).max(160) })

export async function POST(request: Request) {
  return respond(async () => ({ eqa: await createProvider(await readJson(request, schema), await requireActor()) }))
}
