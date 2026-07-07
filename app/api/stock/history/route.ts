import { requireActor } from '@/lib/server/auth'
import { respond } from '@/lib/server/route'
import { getStockWorkspace } from '@/lib/server/stock'

export async function GET() {
  return respond(async () => {
    const actor = await requireActor()
    return { transactions: (await getStockWorkspace(actor, { includeTransactions: true })).transactions }
  })
}
