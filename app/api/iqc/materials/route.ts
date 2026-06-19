import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createControlMaterial } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  level: z.string().trim().max(40).nullable().optional(),
  manufacturer: z.string().trim().max(120).nullable().optional(),
  stockItemId: z.string().uuid().nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await createControlMaterial(await readJson(request, schema), await requireActor()) }))
}
