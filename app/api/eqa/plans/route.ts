import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createAnnualPlan } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  planYear: z.number().int().min(2000).max(2200),
  workSection: z.string().trim().min(1).max(160).optional(),
  departmentName: z.string().trim().min(1).max(160).optional(),
  organizationName: z.string().trim().min(1).max(160).optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ eqa: await createAnnualPlan(await readJson(request, schema), await requireActor()) }))
}
