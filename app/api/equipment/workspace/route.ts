import { requireActor } from '@/lib/server/auth'
import { getEquipmentWorkspace } from '@/lib/server/equipment'
import { respond } from '@/lib/server/route'

export async function GET() { return respond(async () => ({ workspace: await getEquipmentWorkspace(await requireActor()) })) }
