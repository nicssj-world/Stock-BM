import { requireActor } from '@/lib/server/auth'
import { getHpvWorkspace } from '@/lib/server/hpv'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => ({ workspace: await getHpvWorkspace(await requireActor()) }))
}
