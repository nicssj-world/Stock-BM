import { requireStockOperator } from '@/lib/server/auth'
import { invoiceLineUpdateSchema } from '@/lib/receiving/api-schemas'
import { updateInvoiceLine } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  return respond(async () => {
    const { id, lineId } = await params
    return { receiving: await updateInvoiceLine(lineId, await readJson(request, invoiceLineUpdateSchema), await requireStockOperator(), id) }
  })
}
