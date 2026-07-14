import { requireStockAdmin } from '@/lib/server/auth'
import { undoHpvSampleCheckout } from '@/lib/server/hpv'
import { respond } from '@/lib/server/route'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await undoHpvSampleCheckout((await params).id, await requireStockAdmin()) }))
}
