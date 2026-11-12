import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { replacePortalEquipmentLinks } from '@/lib/server/portal-equipment-references'

const schema = z.object({
  module: z.enum(['iqc','eqa','stock']),
  entityId: z.string().uuid(),
  equipmentIds: z.array(z.string().uuid()).max(100),
})
export async function PUT(request: Request) {
  return respond(async () => {
    const actor = await requireActor()
    const { module, entityId, equipmentIds } = await readJson(request, schema)
    await replacePortalEquipmentLinks(actor, module, entityId, equipmentIds)
    return { ok: true }
  })
}
