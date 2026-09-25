import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { finalizeAnnual, getAnnualRevision, refreshAnnualDraft, saveAnnualDraft } from '@/lib/server/vendor-evaluation'
import { readJson, respond } from '@/lib/server/route'
import { draftInputError } from '@/lib/vendors/evaluation'

const text = z.string().max(4000, 'ข้อความยาวเกิน 4,000 ตัวอักษร')
const draftSchema = z.object({ summary: text, strengths: text, risksConcerns: text, recommendations: text, evaluatorId: z.string(), reviewerId: z.string(), approverId: z.string() }).strict()
const bodySchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('save'), draft: draftSchema }),
  z.object({ op: z.literal('refresh') }),
  z.object({ op: z.literal('finalize'), draft: draftSchema }),
])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    const { id, revisionId } = await params
    const body = await readJson(request, bodySchema)
    // The revision must belong to the vendor in the URL, so one vendor's URL cannot be used to change another's report.
    const revision = await getAnnualRevision(revisionId)
    if (revision.vendorId !== id) throw new HttpError(404, 'ไม่พบรายงานประเมิน')
    if (body.op === 'refresh') { await refreshAnnualDraft(revisionId, actor); return { ok: true } }
    const invalid = draftInputError(body.draft)
    if (invalid) throw new HttpError(400, invalid)
    if (body.op === 'save') { await saveAnnualDraft(revisionId, body.draft, actor); return { ok: true } }
    return { ok: true, reportNumber: await finalizeAnnual(revisionId, body.draft, actor) }
  })
}
