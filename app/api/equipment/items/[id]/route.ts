import { requireActor } from '@/lib/server/auth'
import { deleteEquipment, updateEquipment } from '@/lib/server/equipment'
import { readJson, respond } from '@/lib/server/route'
import { equipmentSchema } from '../route'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return respond(async () => ({ workspace: await updateEquipment((await params).id, await readJson(request, equipmentSchema), await requireActor()) })) }
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { return respond(async () => ({ workspace: await deleteEquipment((await params).id, await requireActor()) })) }
