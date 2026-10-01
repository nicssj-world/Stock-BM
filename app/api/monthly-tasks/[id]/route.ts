import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { deactivateMonthlyTaskTemplate, updateMonthlyTaskTemplate } from '@/lib/server/monthly-tasks'
import { readJson, respond } from '@/lib/server/route'

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const updateSchema = z.object({
  month: monthSchema,
  title: z.string().trim().min(1).max(240).optional(),
  assigneeId: z.string().uuid().optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({
    workspace: await updateMonthlyTaskTemplate((await params).id, await readJson(request, updateSchema), await requireStockAdmin()),
  }))
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const month = new URL(request.url).searchParams.get('month') ?? ''
    const parsedMonth = monthSchema.parse(month)
    return { workspace: await deactivateMonthlyTaskTemplate((await params).id, parsedMonth, await requireStockAdmin()) }
  })
}
