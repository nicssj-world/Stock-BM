import { respondEquipmentWrite } from '@/lib/server/equipment-archive'
import { requireActor } from '@/lib/server/auth'
import { deleteEquipmentPlan, updateEquipmentPlan } from '@/lib/server/equipment'
import { readJson, respond } from '@/lib/server/route'
import { planSchema } from '../route'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return respondEquipmentWrite(async () => ({ workspace: await updateEquipmentPlan((await params).id, await readJson(request, planSchema), await requireActor()) })) }
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { return respondEquipmentWrite(async () => ({ workspace: await deleteEquipmentPlan((await params).id, await requireActor()) })) }
