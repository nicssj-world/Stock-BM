import { manualHolidaySchema } from '@/lib/calendar/schemas'
import { requireStockAdmin } from '@/lib/server/auth'
import { addManualHoliday, listHolidaysForAdmin } from '@/lib/server/calendar'
import { readJson, respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => ({ holidays: await listHolidaysForAdmin(await requireStockAdmin()) }))
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    const { date, name } = await readJson(request, manualHolidaySchema)
    return { holidays: await addManualHoliday(date, name, actor) }
  })
}
