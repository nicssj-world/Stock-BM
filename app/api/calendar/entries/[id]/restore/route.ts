import { requireStockOperator } from '@/lib/server/auth'
import { restoreCalendarEntry } from '@/lib/server/calendar'
import { respond } from '@/lib/server/route'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ event: await restoreCalendarEntry((await params).id, await requireStockOperator()) }))
}
