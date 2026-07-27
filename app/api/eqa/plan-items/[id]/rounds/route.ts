import { requireActor } from '@/lib/server/auth'
import { generateRoundsFromPlanItem } from '@/lib/server/eqa'
import { respond } from '@/lib/server/route'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await generateRoundsFromPlanItem((await params).id, await requireActor()) }))
}
