import { typeSchema } from '@/lib/calendar/schemas'
import { requireStockAdmin } from '@/lib/server/auth'
import { updateCalendarType } from '@/lib/server/calendar'
import { readJson, respond } from '@/lib/server/route'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    return { types: await updateCalendarType((await params).id, await readJson(request, typeSchema), actor) }
  })
}
