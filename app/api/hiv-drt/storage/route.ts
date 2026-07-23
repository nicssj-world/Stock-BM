import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { storeHivDrtSample } from '@/lib/server/hiv-drt'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  barcode: z.string().trim().min(1).max(180),
  rackId: z.string().uuid(),
  position: z.number().int().min(1).max(96).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await storeHivDrtSample(await readJson(request, schema), await requireActor()) }))
}
