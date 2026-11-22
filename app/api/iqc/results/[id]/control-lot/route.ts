import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { correctResultControlLot } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ controlLotId: z.string().uuid(), reason: z.string().trim().min(1).max(300) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await correctResultControlLot((await params).id, await readJson(request, schema), await requireActor())
    return { ok: true }
  })
}
