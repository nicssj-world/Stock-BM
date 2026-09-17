import { requireStockOperator } from '@/lib/server/auth'
import { invoiceUpdateSchema } from '@/lib/receiving/api-schemas'
import { getReceivingWorkspace, updateInvoice } from '@/lib/server/receiving'
import { HttpError } from '@/lib/server/errors'
import { readJson, respond } from '@/lib/server/route'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const receiving = await getReceivingWorkspace(actor)
    const { id } = await params
    const invoice = receiving.invoices.find((item) => item.id === id)
    if (!invoice) throw new HttpError(404, 'ไม่พบใบส่งของ')
    return { invoice, receiving }
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ receiving: await updateInvoice((await params).id, await readJson(request, invoiceUpdateSchema), await requireStockOperator()) }))
}
