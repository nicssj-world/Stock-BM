import { z } from 'zod'
import { dateKeySchema, entrySchema } from '@/lib/calendar/schemas'
import { requireStockOperator } from '@/lib/server/auth'
import { createCalendarEntry, getCalendarWorkspace } from '@/lib/server/calendar'
import { readJson, respond } from '@/lib/server/route'

const rangeSchema = z.object({ from: dateKeySchema, to: dateKeySchema })

export async function GET(request: Request) {
  return respond(async () => {
    await requireStockOperator()
    const params = new URL(request.url).searchParams
    const { from, to } = rangeSchema.parse({ from: params.get('from'), to: params.get('to') })
    return { workspace: await getCalendarWorkspace(from, to) }
  })
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockOperator()
    return { event: await createCalendarEntry(await readJson(request, entrySchema), actor) }
  })
}
