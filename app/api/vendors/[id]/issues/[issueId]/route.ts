import { requireStockOperator } from '@/lib/server/auth'
import { vendorIssueUpdateSchema } from '@/lib/receiving/api-schemas'
import { updateVendorIssue } from '@/lib/server/vendors'
import { readJson, respond } from '@/lib/server/route'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const { id, issueId } = await params
    return { issues: await updateVendorIssue(id, issueId, await readJson(request, vendorIssueUpdateSchema), actor) }
  })
}
