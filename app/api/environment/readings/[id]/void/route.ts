import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { voidReading } from '@/lib/server/environment'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ reason: z.string().trim().min(1).max(300) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await voidReading((await params).id, (await readJson(request, schema)).reason, await requireActor())
    return { ok: true }
  })
}
