import { calendarSchema } from '@/lib/calendar/schemas'
import { requireStockAdmin } from '@/lib/server/auth'
import { createCalendar } from '@/lib/server/calendar'
import { readJson, respond } from '@/lib/server/route'

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    return createCalendar(await readJson(request, calendarSchema), actor)
  })
}
