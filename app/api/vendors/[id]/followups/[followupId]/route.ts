import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { updateVendorAnnualFollowup } from '@/lib/server/vendor-evaluation'
import { readJson, respond } from '@/lib/server/route'

const uuid = z.string().uuid()
const schema = z.object({
  status: z.enum(['open','in_progress','closed']),
  responsibleUserId: uuid.nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  actionPlan: z.string().max(4000),
  resolutionNote: z.string().max(4000),
  expectedUpdatedAt: z.string().datetime({offset:true}),
}).strict()

export async function PATCH(request: Request, {params}: {params: Promise<{id:string;followupId:string}>}) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    const {id,followupId}=await params
    await updateVendorAnnualFollowup(id,followupId,await readJson(request,schema),actor)
    return {ok:true}
  })
}
