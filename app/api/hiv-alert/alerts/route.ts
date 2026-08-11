import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createHivLabAlert } from '@/lib/server/hiv-lab-alert'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  hn: z.string().trim().min(1).max(80),
  ln: z.string().trim().min(1).max(180),
  patientName: z.string().trim().min(1).max(200),
  rackId: z.string().uuid(),
})

export async function POST(request: Request) {
  return respond(async () => ({ workspace: await createHivLabAlert(await readJson(request, schema), await requireActor()) }))
}
