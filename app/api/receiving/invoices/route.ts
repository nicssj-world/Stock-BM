import { requireStockOperator } from '@/lib/server/auth'
import { invoiceCreateSchema } from '@/lib/receiving/api-schemas'
import { createInvoice, getReceivingWorkspace } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => {
    const actor = await requireStockOperator()
    const receiving = await getReceivingWorkspace(actor)
    return { invoices: receiving.invoices, receiving }
  })
}

export async function POST(request: Request) {
  return respond(async () => ({ receiving: await createInvoice(await readJson(request, invoiceCreateSchema), await requireStockOperator()) }))
}
