import { requireStockOperator } from '@/lib/server/auth'
import { vendorEvaluationCreateSchema } from '@/lib/vendors/evaluation-schemas'
import { createOrRegenerateVendorEvaluation } from '@/lib/server/vendor-evaluation'
import { readJson, respond } from '@/lib/server/route'

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const input = await readJson(request, vendorEvaluationCreateSchema)
    return { evaluation: await createOrRegenerateVendorEvaluation(input.vendorId, input.fiscalYear, input.judgment, actor) }
  })
}
