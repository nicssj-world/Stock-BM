import { requireActor } from '@/lib/server/auth'
import { deleteEquipmentLink } from '@/lib/server/equipment'
import { respond } from '@/lib/server/route'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { return respond(async () => ({ workspace: await deleteEquipmentLink((await params).id, await requireActor()) })) }
