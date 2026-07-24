import { requireActor } from '@/lib/server/auth'
import { acknowledgeMorningTalk } from '@/lib/server/morning-talk'
import { respond } from '@/lib/server/route'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await acknowledgeMorningTalk((await params).id, await requireActor()) }))
}
