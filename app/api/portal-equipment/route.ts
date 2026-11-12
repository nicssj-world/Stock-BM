import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { readJson, respond } from '@/lib/server/route'
import { getPortalEquipmentReferences, lookupAndCachePortalEquipment } from '@/lib/server/portal-equipment-references'

const lookupSchema = z.object({ labCode: z.string().trim().min(1).max(80) })
export async function GET() {
  return respond(async () => {
    const actor = await requireActor()
    if (actor.role === 'Assistant') throw new HttpError(403, 'ไม่มีสิทธิ์เข้าถึงเครื่องมือ')
    return { equipment: await getPortalEquipmentReferences() }
  })
}
export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireActor()
    const { labCode } = await readJson(request, lookupSchema)
    return { equipment: await lookupAndCachePortalEquipment(actor, labCode) }
  })
}
