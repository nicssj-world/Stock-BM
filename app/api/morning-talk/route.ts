import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createMorningTalk, getMorningTalkWorkspace } from '@/lib/server/morning-talk'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  talkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1).max(240),
  agenda: z.string().trim().max(5000).nullable().optional(),
  attendeeIds: z.array(z.string().uuid()).min(1).max(200),
})

export async function GET() {
  return respond(async () => {
    const actor = await requireActor()
    return { workspace: await getMorningTalkWorkspace(actor) }
  })
}

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await createMorningTalk(await readJson(request, schema), await requireActor()) }))
}
