import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { approveEqaDocument, revokeEqaDocumentApproval } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const paramsSchema = z.object({ type: z.enum(['annual-plan', 'round-receipt', 'annual-summary']), id: z.string().uuid() })
const bodySchema = z.object({ approvalRole: z.enum(['analyst', 'technical-manager', 'quality-manager', 'section-head', 'department-head']) })

export async function POST(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  return respond(async () => { const route = paramsSchema.parse(await params); const body = await readJson(request, bodySchema); return { eqa: await approveEqaDocument(route.type, route.id, body.approvalRole, await requireActor()) } })
}
export async function DELETE(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  return respond(async () => { const route = paramsSchema.parse(await params); const body = await readJson(request, bodySchema); return { eqa: await revokeEqaDocumentApproval(route.type, route.id, body.approvalRole, await requireActor()) } })
}
