import { requireStockOperator } from '@/lib/server/auth'
import { vendorEvaluationUpdateSchema } from '@/lib/vendors/evaluation-schemas'
import { getVendorEvaluationWorkspace, createOrRegenerateVendorEvaluation } from '@/lib/server/vendor-evaluation'
import { readJson, respond } from '@/lib/server/route'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => { await requireStockOperator(); return { evaluation: await getVendorEvaluationWorkspace((await params).id) } })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const { id } = await params
    const current = await getVendorEvaluationWorkspace(id)
    return { evaluation: await createOrRegenerateVendorEvaluation(current.vendor.id, current.evaluation.fiscalYear, (await readJson(request, vendorEvaluationUpdateSchema)).judgment, actor) }
  })
}
