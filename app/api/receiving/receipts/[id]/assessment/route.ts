import { requireStockOperator } from '@/lib/server/auth'
import { receiptAssessmentSchema } from '@/lib/receiving/api-schemas'
import { completeReceiptAssessment } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    return { receiving: await completeReceiptAssessment((await params).id, await readJson(request, receiptAssessmentSchema), actor) }
  })
}
