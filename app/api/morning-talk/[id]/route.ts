import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteMorningTalk, updateMorningTalk } from '@/lib/server/morning-talk'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  talkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  agenda: z.string().trim().max(5000).nullable().optional(),
  attendeeIds: z.array(z.string().uuid()).min(1).max(200).optional(),
  checklistItems: z.array(z.object({ id: z.string().uuid().optional(), title: z.string().trim().min(1).max(240) })).max(30).optional(),
  actionItems: z.array(z.object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(240),
    ownerId: z.string().uuid().nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    status: z.enum(['todo', 'in-progress', 'done']),
    note: z.string().trim().max(1000).nullable().optional(),
  })).max(50).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await updateMorningTalk((await params).id, await readJson(request, schema), await requireActor()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await deleteMorningTalk((await params).id, await requireActor()) }))
}
