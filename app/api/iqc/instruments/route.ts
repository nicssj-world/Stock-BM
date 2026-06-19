import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createInstrument } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(160),
  model: z.string().trim().max(80).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await createInstrument(await readJson(request, schema), await requireActor()) }))
}
