import { requireStockOperator } from '@/lib/server/auth'
import { confirmReceiptSchema } from '@/lib/receiving/api-schemas'
import { confirmReceipt } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await readJson(request, confirmReceiptSchema)
    return { receiving: await confirmReceipt((await params).id, await requireStockOperator()) }
  })
}
