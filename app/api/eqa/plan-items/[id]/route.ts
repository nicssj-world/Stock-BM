import { requireActor } from '@/lib/server/auth'
import { deletePlanItem, updatePlanItem } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'
import { eqaPlanItemSchema } from '@/lib/eqa/api-schemas'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await updatePlanItem((await params).id, await readJson(request, eqaPlanItemSchema), await requireActor()) }))
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await deletePlanItem((await params).id, await requireActor()) }))
}
