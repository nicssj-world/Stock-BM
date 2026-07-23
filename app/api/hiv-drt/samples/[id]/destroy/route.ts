import { requireActor } from '@/lib/server/auth'
import { destroyHivDrtSample } from '@/lib/server/hiv-drt'
import { respond } from '@/lib/server/route'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await destroyHivDrtSample((await params).id, await requireActor()) }))
}
