import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { getIqcBaselineReview } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  controlLotId: z.string().uuid(),
  analyteId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  includedResultIds: z.array(z.string().uuid()).optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ review: await getIqcBaselineReview(await requireActor(), await readJson(request, schema)) }))
}
