import { typeSchema } from '@/lib/calendar/schemas'
import { requireStockAdmin } from '@/lib/server/auth'
import { createCalendarType } from '@/lib/server/calendar'
import { readJson, respond } from '@/lib/server/route'

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    return { types: await createCalendarType(await readJson(request, typeSchema), actor) }
  })
}
