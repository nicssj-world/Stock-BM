import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteUnit, updateUnit } from '@/lib/server/environment'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  kind: z.enum(['fridge', 'freezer', 'room', 'incubator', 'other']).optional(),
  locationId: z.string().uuid().nullable().optional(),
  minLimit: z.number().nullable().optional(),
  maxLimit: z.number().nullable().optional(),
  unit: z.string().trim().max(16).nullable().optional(),
  readingsPerDay: z.number().int().min(1).max(3).nullable().optional(),
  trackHumidity: z.boolean().nullable().optional(),
  humidityMinLimit: z.number().min(0).max(100).nullable().optional(),
  humidityMaxLimit: z.number().min(0).max(100).nullable().optional(),
  thermometerId: z.string().trim().max(120).nullable().optional(),
  dataloggerId: z.string().trim().max(120).nullable().optional(),
  calibrationDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  availabilityStatus: z.enum(['active', 'maintenance', 'paused']).optional(),
  unavailableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  unavailableUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  unavailableNote: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ env: await updateUnit((await params).id, await readJson(request, schema), await requireActor()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await deleteUnit((await params).id, await requireActor())
    return { ok: true }
  })
}
