import { requireActor } from '@/lib/server/auth'
import { getHivDrtWorkspace } from '@/lib/server/hiv-drt'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => ({ workspace: await getHivDrtWorkspace(await requireActor()) }))
}
