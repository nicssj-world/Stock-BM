import { requireActor } from '@/lib/server/auth'
import { deleteHivDrtRack } from '@/lib/server/hiv-drt'
import { respond } from '@/lib/server/route'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await deleteHivDrtRack((await params).id, await requireActor()) }))
}
