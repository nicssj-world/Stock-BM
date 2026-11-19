import { requireStockOperator } from '@/lib/server/auth'
import { getCalendarEntryHistory } from '@/lib/server/calendar'
import { respond } from '@/lib/server/route'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await requireStockOperator()
    return { history: await getCalendarEntryHistory((await params).id) }
  })
}
