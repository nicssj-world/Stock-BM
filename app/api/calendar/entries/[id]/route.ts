import { entrySchema } from '@/lib/calendar/schemas'
import { requireStockOperator } from '@/lib/server/auth'
import { deleteCalendarEntry, updateCalendarEntry } from '@/lib/server/calendar'
import { readJson, respond } from '@/lib/server/route'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    return { event: await updateCalendarEntry((await params).id, await readJson(request, entrySchema), actor) }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => deleteCalendarEntry((await params).id, await requireStockOperator()))
}
