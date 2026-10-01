import { z } from 'zod'
import { requireStockOperator } from '@/lib/server/auth'
import { updateMonthlyTaskOccurrence } from '@/lib/server/monthly-tasks'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  completed: z.boolean(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({
    workspace: await updateMonthlyTaskOccurrence((await params).id, await readJson(request, schema), await requireStockOperator()),
  }))
}
