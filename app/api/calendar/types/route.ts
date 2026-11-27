import { z } from 'zod'
import { typeSchema } from '@/lib/calendar/schemas'
import { requireStockAdmin } from '@/lib/server/auth'
import { createCalendarType, reorderCalendarTypeButtons } from '@/lib/server/calendar'
import { readJson, respond } from '@/lib/server/route'

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    return { types: await createCalendarType(await readJson(request, typeSchema), actor) }
  })
}

const orderSchema = z.object({
  calendarId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(1000),
  expectedIds: z.array(z.string().uuid()).min(1).max(1000),
})

export async function PATCH(request: Request) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    return { types: await reorderCalendarTypeButtons(await readJson(request, orderSchema), actor) }
  })
}
