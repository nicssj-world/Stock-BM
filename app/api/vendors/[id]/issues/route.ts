import { requireStockOperator } from '@/lib/server/auth'
import { vendorIssueCreateSchema } from '@/lib/receiving/api-schemas'
import { createVendorIssue, listVendorIssues } from '@/lib/server/vendors'
import { readJson, respond } from '@/lib/server/route'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await requireStockOperator()
    return { issues: await listVendorIssues((await params).id) }
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const { id } = await params
    return { issues: await createVendorIssue(id, await readJson(request, vendorIssueCreateSchema), actor) }
  })
}
