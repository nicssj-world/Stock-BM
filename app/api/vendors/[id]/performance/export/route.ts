import { requireStockOperator } from '@/lib/server/auth'
import { buildVendorPerformanceCsv } from '@/lib/bm/csv'
import { getVendorPerformanceSnapshot, listVendorIssues } from '@/lib/server/vendors'
import { bangkokToday, fiscalYearBE } from '@/lib/vendors/fiscal-year'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStockOperator()
  const { id } = await params
  const requested = Number(new URL(request.url).searchParams.get('fiscalYear'))
  const fiscalYear = Number.isInteger(requested) && requested >= 2500 && requested <= 3000 ? requested : fiscalYearBE(bangkokToday())
  const [performance, issues] = await Promise.all([getVendorPerformanceSnapshot(id, fiscalYear, actor), listVendorIssues(id)])
  return new Response(buildVendorPerformanceCsv(performance, issues), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendor-${performance.vendor.vendorCode}-${fiscalYear}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
