import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { closeCorrectiveAction } from '@/lib/server/environment'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ status: z.literal('closed') })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await readJson(request, schema)
    await closeCorrectiveAction((await params).id, await requireActor())
    return { ok: true }
  })
}
