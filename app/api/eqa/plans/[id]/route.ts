import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { updateAnnualPlan } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  workSection: z.string().trim().min(1).max(160),
  departmentName: z.string().trim().min(1).max(160),
  organizationName: z.string().trim().min(1).max(160),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await updateAnnualPlan((await params).id, await readJson(request, schema), await requireActor()) }))
}
