import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createUnit } from '@/lib/server/environment'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  kind: z.enum(['fridge', 'freezer', 'room', 'incubator', 'other']),
  locationId: z.string().uuid().nullable().optional(),
  minLimit: z.number().nullable().optional(),
  maxLimit: z.number().nullable().optional(),
  unit: z.string().trim().max(16).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ env: await createUnit(await readJson(request, schema), await requireActor()) }))
}
