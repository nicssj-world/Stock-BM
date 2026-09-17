import { requireStockAdmin } from '@/lib/server/auth'
import { vendorUpdateSchema } from '@/lib/receiving/api-schemas'
import { readJson, respond } from '@/lib/server/route'
import { deleteVendor, updateVendor } from '@/lib/server/vendors'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ vendors: await updateVendor((await params).id, await readJson(request, vendorUpdateSchema), await requireStockAdmin()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ vendors: await deleteVendor((await params).id, await requireStockAdmin()) }))
}
