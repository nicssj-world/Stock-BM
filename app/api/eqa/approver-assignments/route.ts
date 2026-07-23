import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { setEqaApproverAssignment } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ approvalRole: z.enum(['technical-manager', 'quality-manager', 'section-head', 'department-head']), userId: z.string().uuid() })
export async function PUT(request: Request) {
  const body = await readJson(request, schema)
  return respond(async () => ({ eqa: await setEqaApproverAssignment(body.approvalRole, body.userId, await requireActor()) }))
}
