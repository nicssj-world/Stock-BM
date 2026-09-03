import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { updateMorningTalkChecklistItem } from '@/lib/server/morning-talk'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ completed: z.boolean() })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  return respond(async () => {
    const { id, itemId } = await params
    return { workspace: await updateMorningTalkChecklistItem(id, itemId, await readJson(request, schema), await requireActor()) }
  })
}
