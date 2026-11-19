import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { deleteManualHoliday, setHolidayDayOff } from '@/lib/server/calendar'
import { readJson, respond } from '@/lib/server/route'

const dayOffSchema = z.object({ isDayOff: z.boolean() })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    const { isDayOff } = await readJson(request, dayOffSchema)
    return { holidays: await setHolidayDayOff((await params).id, isDayOff, actor) }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ holidays: await deleteManualHoliday((await params).id, await requireStockAdmin()) }))
}
