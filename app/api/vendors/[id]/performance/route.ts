import { z } from 'zod'
import { requireStockOperator } from '@/lib/server/auth'
import { getVendorPerformance } from '@/lib/server/vendors'
import { respond } from '@/lib/server/route'

const fiscalYearSchema = z.string().regex(/^\d{4}$/, 'ปีงบประมาณไม่ถูกต้อง')

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await requireStockOperator()
    const fiscalYear = fiscalYearSchema.parse(new URL(request.url).searchParams.get('fiscalYear') ?? String(new Date().getUTCFullYear()))
    return { performance: await getVendorPerformance((await params).id, fiscalYear) }
  })
}
