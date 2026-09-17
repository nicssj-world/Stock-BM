import { requireStockOperator } from '@/lib/server/auth'
import { receiptLineInputSchema } from '@/lib/receiving/api-schemas'
import { addReceiptLine } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ receiving: await addReceiptLine((await params).id, await readJson(request, receiptLineInputSchema), await requireStockOperator()) }))
}
