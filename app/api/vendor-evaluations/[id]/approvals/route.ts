import { requireStockOperator } from '@/lib/server/auth'
import { getVendorEvaluationWorkspace, approveVendorEvaluation, revokeVendorEvaluationApproval } from '@/lib/server/vendor-evaluation'
import { respond } from '@/lib/server/route'
import { z } from 'zod'
import { VENDOR_EVALUATION_ROLES } from '@/lib/vendors/evaluation-types'

const roleSchema = z.enum(VENDOR_EVALUATION_ROLES)

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const form = await request.formData()
    const approvalRole = roleSchema.parse(form.get('approvalRole'))
    const signerName = typeof form.get('signerName') === 'string' ? form.get('signerName') as string : ''
    const signature = form.get('signature')
    if (!(signature instanceof File)) throw new Error('กรุณาแนบลายเซ็น')
    return { evaluation: await approveVendorEvaluation((await params).id, approvalRole, signerName, signature, actor) }
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const body = await request.json().catch(() => ({})) as { approvalRole?: unknown }
    const approvalRole = roleSchema.parse(body.approvalRole)
    return { evaluation: await revokeVendorEvaluationApproval((await params).id, approvalRole, actor) }
  })
}
