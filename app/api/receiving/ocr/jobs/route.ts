import { requireStockOperator } from '@/lib/server/auth'
import { assertReceivingEnabled } from '@/lib/server/receiving'
import { HttpError } from '@/lib/server/errors'
import { respond } from '@/lib/server/route'

export const runtime = 'nodejs'

export async function POST(_request: Request) {
  return respond(async () => {
    await requireStockOperator()
    await assertReceivingEnabled()
    throw new HttpError(501, 'OCR intake จะเปิดใน Phase 2')
  })
}
