import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { setRoundIqcPanel } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

// Links (or unlinks, with null) every result of a round to one IQC panel in a
// single write, so the round is never left half-linked.
const schema = z.object({ iqcAnalyteId: z.string().uuid().nullable() }).strict()
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await setRoundIqcPanel((await params).id, (await readJson(request, schema)).iqcAnalyteId, await requireActor()) }))
}
