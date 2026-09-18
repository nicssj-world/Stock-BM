import { requireStockOperator } from '@/lib/server/auth'
import { receiptCreateSchema } from '@/lib/receiving/api-schemas'
import { createReceiptDraft, getReceivingWorkspace } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => {
    const actor = await requireStockOperator()
    const receiving = await getReceivingWorkspace(actor)
    return { receipts: receiving.receipts, receiving }
  })
}

export async function POST(request: Request) {
  return respond(async () => createReceiptDraft(await readJson(request, receiptCreateSchema), await requireStockOperator()))
}
