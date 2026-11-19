import { requireStockOperator } from '@/lib/server/auth'
import { getFeedToken } from '@/lib/server/calendar'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => ({ token: await getFeedToken(await requireStockOperator()) }))
}

/** Revokes the old link and issues a new one. */
export async function POST() {
  return respond(async () => ({ token: await getFeedToken(await requireStockOperator(), true) }))
}
