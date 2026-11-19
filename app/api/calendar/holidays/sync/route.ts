import { requireStockAdmin } from '@/lib/server/auth'
import { listHolidaysForAdmin, syncGoogleHolidays } from '@/lib/server/calendar'
import { respond } from '@/lib/server/route'

export async function POST() {
  return respond(async () => {
    const actor = await requireStockAdmin()
    const result = await syncGoogleHolidays(actor)
    return { result, holidays: await listHolidaysForAdmin(actor) }
  })
}
