import { requireActor } from '@/lib/server/auth'
import { listAuditLogs } from '@/lib/server/audit'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => {
    await requireActor()
    return { logs: await listAuditLogs() }
  })
}

