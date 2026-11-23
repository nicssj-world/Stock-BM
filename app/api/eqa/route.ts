import { requireActor } from '@/lib/server/auth'
import { getEqaWorkspace } from '@/lib/server/eqa'
import { respond } from '@/lib/server/route'

// The whole EQA workspace, for a client that needs to refresh it after a
// change made through another module's API (e.g. linking portal equipment).
export async function GET() {
  return respond(async () => ({ eqa: await getEqaWorkspace(await requireActor()) }))
}
