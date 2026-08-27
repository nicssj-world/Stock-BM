import { requireActor } from '@/lib/server/auth'
import { getIqcSetupHealth } from '@/lib/server/iqc'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => ({ setupHealth: await getIqcSetupHealth(await requireActor()) }))
}
