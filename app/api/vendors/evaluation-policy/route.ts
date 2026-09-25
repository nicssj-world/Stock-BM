import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { approveEvaluationPolicy, saveEvaluationPolicyProposal } from '@/lib/server/vendor-evaluation'
import { readJson, respond } from '@/lib/server/route'

const proposalSchema = z.object({
  policyId: z.string().uuid().nullable(),
  version: z.string().max(80),
  effectiveFromFiscalYear: z.number().int(),
  effectiveToFiscalYear: z.number().int().nullable(),
  passThreshold: z.number(),
  minimumCoveragePercent: z.number(),
  coverageStartDate: z.string(),
  note: z.string().max(2000),
  criteria: z.array(z.object({ criterionCode: z.string(), weight: z.number() }).strict()).length(8, 'กรุณาระบุเกณฑ์ให้ครบ 8 ข้อ'),
}).strict()
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), proposal: proposalSchema }),
  z.object({ action: z.literal('approve'), policyId: z.string().uuid() }),
])

// One QP for the whole work group: only an Admin can propose or approve. Reading the policy is open to every signed-in user (server page).
export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    const body = await readJson(request, bodySchema)
    if (body.action === 'save') return { policyId: await saveEvaluationPolicyProposal(body.proposal, actor) }
    await approveEvaluationPolicy(body.policyId, actor)
    return { ok: true }
  })
}
