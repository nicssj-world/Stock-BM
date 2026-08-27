import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { resolveActiveIqcBaseline } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  controlLotId: z.string().uuid(),
  analyteId: z.string().uuid(),
  instrumentId: z.string().uuid(),
})

export async function POST(request: Request) {
  return respond(async () => ({ baseline: await resolveActiveIqcBaseline(await requireActor(), await readJson(request, schema)) }))
}
