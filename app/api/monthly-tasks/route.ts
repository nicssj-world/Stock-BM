import { z } from 'zod'
import { todayBangkok } from '@/lib/bm/rules'
import { requireStockOperator } from '@/lib/server/auth'
import { createMonthlyTaskTemplate, getMonthlyTaskWorkspace } from '@/lib/server/monthly-tasks'
import { readJson, respond } from '@/lib/server/route'

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const createSchema = z.object({
  month: monthSchema,
  title: z.string().trim().min(1).max(240),
  assigneeId: z.string().uuid(),
  dueDay: z.coerce.number().int().min(1).max(31),
})

export async function GET(request: Request) {
  return respond(async () => {
    await requireStockOperator()
    const month = monthSchema.parse(new URL(request.url).searchParams.get('month') ?? todayBangkok().slice(0, 7))
    return { workspace: await getMonthlyTaskWorkspace(month) }
  })
}

export async function POST(request: Request) {
  return respond(async () => ({
    workspace: await createMonthlyTaskTemplate(await readJson(request, createSchema), await requireStockOperator()),
  }))
}
