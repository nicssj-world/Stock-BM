import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { supplierCodeReviewSchema } from '@/lib/receiving/api-schemas'
import { assertReceivingEnabled, getReceivingWorkspace } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'
import { reviewSupplierCode } from '@/lib/server/supplier-codes'

/** Admin: approve / reject a pending mapping, or revoke an approved one. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    await assertReceivingEnabled()
    const id = z.string().uuid().parse((await params).id)
    await reviewSupplierCode(id, await readJson(request, supplierCodeReviewSchema), actor)
    return { receiving: await getReceivingWorkspace(actor) }
  })
}
