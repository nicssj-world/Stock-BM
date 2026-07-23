import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createHivDrtRack } from '@/lib/server/hiv-drt'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ rackCode: z.string().trim().min(1).max(80) })

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await createHivDrtRack(await readJson(request, schema), await requireActor()) }))
}
