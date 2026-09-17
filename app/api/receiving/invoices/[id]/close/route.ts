import { requireStockOperator } from '@/lib/server/auth'
import { assertReceivingEnabled } from '@/lib/server/receiving'
import { HttpError } from '@/lib/server/errors'
import { respond } from '@/lib/server/route'

export async function POST(_request: Request, { params: _params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await requireStockOperator()
    await assertReceivingEnabled()
    throw new HttpError(501, 'รอการอนุมัติ policy การปิดใบส่งของ')
  })
}
