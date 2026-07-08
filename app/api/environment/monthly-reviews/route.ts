import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { reviewMonthlyReport, unlockMonthlyReport } from '@/lib/server/environment'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  unitId: z.string().uuid(),
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  note: z.string().trim().max(1000).nullable().optional(),
})

const unlockSchema = schema.pick({ unitId: true, yearMonth: true })

export async function POST(request: Request) {
  return respond(async () => ({ env: await reviewMonthlyReport(await readJson(request, schema), await requireActor()) }))
}

export async function DELETE(request: Request) {
  return respond(async () => {
    await unlockMonthlyReport(await readJson(request, unlockSchema), await requireActor())
    return { ok: true }
  })
}
