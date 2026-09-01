import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { getRoutineWorkspaceByToken, logRoutineMaintenance, resolveRoutineEquipmentToken } from '@/lib/server/routine-maintenance'
import { readJson, respond } from '@/lib/server/route'
import { HttpError } from '@/lib/server/errors'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const logSchema = z.object({
  formId: z.string().uuid(),
  versionId: z.string().uuid(),
  plannedOn: date,
  scheduledOn: date,
  taskResults: z.array(z.object({ itemId: z.string().uuid(), label: z.string().optional(), state: z.enum(['done', 'not-applicable', 'not-done']) })).min(1).max(80),
  note: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: z.string().uuid(),
})

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  return respond(async () => {
    const { token } = await context.params
    return { workspace: await getRoutineWorkspaceByToken(await requireActor(), token) }
  })
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  return respond(async () => {
    const actor = await requireActor()
    const { token } = await context.params
    const equipment = await resolveRoutineEquipmentToken(token)
    if (!equipment) throw new HttpError(404, 'QR นี้ไม่พร้อมใช้งาน')
    const body = await readJson(request, logSchema)
    const workspace = await logRoutineMaintenance({ ...body, source: 'qr', equipmentId: equipment.id }, actor)
    return { workspace }
  })
}
