import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { checkoutHivDrtSample } from '@/lib/server/hiv-drt'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  barcode: z.string().trim().min(1).max(180),
  destination: z.string().trim().max(180).optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await checkoutHivDrtSample(await readJson(request, schema), await requireActor()) }))
}
