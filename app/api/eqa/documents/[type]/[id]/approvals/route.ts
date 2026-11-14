import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { approveEqaDocument, revokeEqaDocumentApproval } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const paramsSchema = z.object({ type: z.enum(['annual-plan', 'round-receipt', 'annual-summary']), id: z.string().uuid() })
const bodySchema = z.object({ approvalRole: z.enum(['analyst', 'technical-manager', 'quality-manager', 'section-head', 'department-head']) })
const signerSchema = bodySchema.extend({ signerName: z.string().trim().min(1).max(200) })
// With a saved signature the server uses the assigned or signed-in user's own name.
const savedSignerSchema = bodySchema.extend({ signerName: z.string().trim().max(200).optional() })

export const runtime = 'nodejs'

function text(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === 'string' ? value : ''
}

export async function POST(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  return respond(async () => {
    const route = paramsSchema.parse(await params)
    const form = await request.formData()
    // "useSavedSignature" signs with the signed-in user's own saved signature,
    // which the server reads itself; otherwise a drawn PNG must be uploaded.
    const useSavedSignature = text(form, 'useSavedSignature') === '1'
    const signature = form.get('signature')
    if (!useSavedSignature && !(signature instanceof File)) throw new HttpError(400, 'กรุณาวาดลายเซ็นก่อนลงนาม')
    const body = (useSavedSignature ? savedSignerSchema : signerSchema).parse({ approvalRole: text(form, 'approvalRole'), signerName: text(form, 'signerName') })
    return { eqa: await approveEqaDocument(route.type, route.id, body.approvalRole, await requireActor(), { signerName: body.signerName ?? '', signature: signature instanceof File ? signature : null, useSavedSignature }) }
  })
}
export async function DELETE(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  return respond(async () => { const route = paramsSchema.parse(await params); const body = await readJson(request, bodySchema); return { eqa: await revokeEqaDocumentApproval(route.type, route.id, body.approvalRole, await requireActor()) } })
}
