import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createHpvStorageBox } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  boxCode: z.string().trim().min(1).max(80),
  boxType: z.enum(['self_collected', 'clinician_collected']),
})

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await createHpvStorageBox(await readJson(request, schema), await requireActor()) }))
}
