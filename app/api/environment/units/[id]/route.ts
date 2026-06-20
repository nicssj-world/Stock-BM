import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { updateUnit } from '@/lib/server/environment'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  kind: z.enum(['fridge', 'freezer', 'room', 'incubator', 'other']).optional(),
  locationId: z.string().uuid().nullable().optional(),
  minLimit: z.number().nullable().optional(),
  maxLimit: z.number().nullable().optional(),
  unit: z.string().trim().max(16).nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ env: await updateUnit((await params).id, await readJson(request, schema), await requireActor()) }))
}
