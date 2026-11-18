import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { voidResult } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ reason: z.string().trim().min(1).max(300), dataEntryError: z.boolean().optional() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { reason, dataEntryError } = await readJson(request, schema)
    return { iqc: await voidResult((await params).id, reason, await requireActor(), { dataEntryError }) }
  })
}
