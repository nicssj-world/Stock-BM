import { requireStockAdmin } from '@/lib/server/auth'
import { receiptAssessmentSchema } from '@/lib/receiving/api-schemas'
import { reviseReceiptAssessment } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'

// Admin only: correct a completed receipt assessment (every revision is kept).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    return { receiving: await reviseReceiptAssessment((await params).id, await readJson(request, receiptAssessmentSchema), actor) }
  })
}
