import { requireActor } from '@/lib/server/auth'
import { sendHivLabAlert } from '@/lib/server/hiv-lab-alert'
import { respond } from '@/lib/server/route'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await sendHivLabAlert((await params).id, await requireActor()) }))
}
