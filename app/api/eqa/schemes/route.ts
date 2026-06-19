import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createScheme } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  providerId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(80).nullable().optional(),
  analyteScope: z.string().trim().max(300).nullable().optional(),
  roundsPerYear: z.number().int().positive().nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ eqa: await createScheme(await readJson(request, schema), await requireActor()) }))
}
