import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createHpvSite, updateHpvSite } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const createSchema = z.object({
  code: z.string().trim().max(80).nullable().optional(),
  name: z.string().trim().min(1).max(180),
  siteType: z.string().trim().max(80).nullable().optional(),
})

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
  selfSupplied: z.boolean().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await createHpvSite(await readJson(request, createSchema), await requireActor()) }))
}

export async function PATCH(request: Request) {
  return respond(async () => ({ workspace: await updateHpvSite(await readJson(request, updateSchema), await requireActor()) }))
}
