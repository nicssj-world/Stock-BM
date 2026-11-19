import { requireStockOperator } from '@/lib/server/auth'
import { supplierCodeCreateSchema } from '@/lib/receiving/api-schemas'
import { assertReceivingEnabled, getReceivingWorkspace } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'
import { requestSupplierCodes } from '@/lib/server/supplier-codes'

/** Remember a supplier Bill code → item mapping (Admin: approved now; Staff: queued for approval). */
export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockOperator()
    await assertReceivingEnabled()
    const result = await requestSupplierCodes(await readJson(request, supplierCodeCreateSchema), actor)
    return { ...result, receiving: await getReceivingWorkspace(actor) }
  })
}
