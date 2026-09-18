import { requireStockOperator } from '@/lib/server/auth'
import { buildVendorPerformanceCsv } from '@/lib/bm/csv'
import { getVendorPerformance } from '@/lib/server/vendors'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStockOperator()
  const fiscalYear = new URL(request.url).searchParams.get('fiscalYear') ?? String(new Date().getUTCFullYear())
  const performance = await getVendorPerformance((await params).id, /^\d{4}$/.test(fiscalYear) ? fiscalYear : String(new Date().getUTCFullYear()))
  return new Response(buildVendorPerformanceCsv(performance), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendor-${performance.vendor.code}-${performance.fiscalYear}.csv"`,
    },
  })
}
