import { requireActor } from '@/lib/server/auth'
import { rotateEquipmentToken } from '@/lib/server/equipment'
import { respond } from '@/lib/server/route'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { return respond(async () => ({ workspace: await rotateEquipmentToken((await params).id, await requireActor()) })) }
