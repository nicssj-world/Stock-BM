import { requireStockOperator } from '@/lib/server/auth'
import { receiptUpdateSchema } from '@/lib/receiving/api-schemas'
import { cancelReceiptDraft, getReceivingWorkspace, updateReceipt } from '@/lib/server/receiving'
import { HttpError } from '@/lib/server/errors'
import { readJson, respond } from '@/lib/server/route'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const receiving = await getReceivingWorkspace(actor)
    const { id } = await params
    const receipt = receiving.receipts.find((item) => item.id === id)
    if (!receipt) throw new HttpError(404, 'ไม่พบใบรับเข้า')
    return { receipt, receiving }
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ receiving: await updateReceipt((await params).id, await readJson(request, receiptUpdateSchema), await requireStockOperator()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ receiving: await cancelReceiptDraft((await params).id, await requireStockOperator()) }))
}
