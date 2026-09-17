import { requireStockAdmin, requireStockOperator } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { createVendor, listSupplierCandidates, listVendors } from '@/lib/server/vendors'
import { vendorCreateSchema } from '@/lib/receiving/api-schemas'

export async function GET() {
  return respond(async () => {
    await requireStockOperator()
    const [vendors, supplierCandidates] = await Promise.all([listVendors(), listSupplierCandidates()])
    return { vendors, supplierCandidates }
  })
}

export async function POST(request: Request) {
  return respond(async () => ({ vendors: await createVendor(await readJson(request, vendorCreateSchema), await requireStockAdmin()) }))
}
