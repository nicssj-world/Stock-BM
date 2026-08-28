import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { approveEqaDocument, revokeEqaDocumentApproval } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const paramsSchema = z.object({ type: z.enum(['annual-plan', 'round-receipt', 'annual-summary']), id: z.string().uuid() })
const bodySchema = z.object({ approvalRole: z.enum(['analyst', 'technical-manager', 'quality-manager', 'section-head', 'department-head']) })
const signerSchema = bodySchema.extend({ signerName: z.string().trim().min(1).max(200) })

export const runtime = 'nodejs'

function text(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === 'string' ? value : ''
}

export async function POST(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  return respond(async () => {
    const route = paramsSchema.parse(await params)
    const form = await request.formData()
    const signature = form.get('signature')
    if (!(signature instanceof File)) throw new HttpError(400, 'กรุณาวาดลายเซ็นก่อนลงนาม')
    const body = signerSchema.parse({ approvalRole: text(form, 'approvalRole'), signerName: text(form, 'signerName') })
    return { eqa: await approveEqaDocument(route.type, route.id, body.approvalRole, await requireActor(), { signerName: body.signerName, signature }) }
  })
}
export async function DELETE(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  return respond(async () => { const route = paramsSchema.parse(await params); const body = await readJson(request, bodySchema); return { eqa: await revokeEqaDocumentApproval(route.type, route.id, body.approvalRole, await requireActor()) } })
}
