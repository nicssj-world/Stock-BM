import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { upsertControlPlan } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  analyteId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  requiredLevels: z.array(z.string().trim().min(1).max(80)).min(1),
  frequency: z.enum(['daily', 'per-run']),
  westgardRules: z.array(z.enum(['1-2s', '1-3s', '2-2s', 'R-4s', '4-1s', '10x'])).min(1),
  isActive: z.boolean().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await upsertControlPlan(await readJson(request, schema), await requireActor()) }))
}
