import { z } from 'zod'
import { requireStockOperator } from '@/lib/server/auth'
import { getVendorPerformanceSnapshot } from '@/lib/server/vendors'
import { respond } from '@/lib/server/route'
import { bangkokToday, fiscalYearBE } from '@/lib/vendors/fiscal-year'

const fiscalYearSchema = z.coerce.number().int().min(2500).max(3000)

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const requested = new URL(request.url).searchParams.get('fiscalYear')
    const fiscalYear = requested ? fiscalYearSchema.parse(requested) : fiscalYearBE(bangkokToday())
    return { performance: await getVendorPerformanceSnapshot((await params).id, fiscalYear, actor) }
  })
}
