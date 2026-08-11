import { requireActor } from '@/lib/server/auth'
import { getHivLabAlertWorkspace } from '@/lib/server/hiv-lab-alert'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => ({ workspace: await getHivLabAlertWorkspace(await requireActor()) }))
}
