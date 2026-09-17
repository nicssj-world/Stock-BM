import { requireStockOperator } from '@/lib/server/auth'
import { receiptLineUpdateSchema } from '@/lib/receiving/api-schemas'
import { deleteReceiptLine, updateReceiptLine } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'

export async function PATCH(request: Request, { params }: { params: Promise<{ lineId: string }> }) {
  return respond(async () => ({ receiving: await updateReceiptLine((await params).lineId, await readJson(request, receiptLineUpdateSchema), await requireStockOperator()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ lineId: string }> }) {
  return respond(async () => ({ receiving: await deleteReceiptLine((await params).lineId, await requireStockOperator()) }))
}
