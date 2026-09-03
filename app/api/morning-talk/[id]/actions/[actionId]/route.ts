import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { updateMorningTalkActionItem } from '@/lib/server/morning-talk'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['todo', 'in-progress', 'done']).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; actionId: string }> },
) {
  return respond(async () => {
    const { id, actionId } = await params
    return { workspace: await updateMorningTalkActionItem(id, actionId, await readJson(request, schema), await requireActor()) }
  })
}
