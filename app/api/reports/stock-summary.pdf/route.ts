import { requireActor } from '@/lib/server/auth'
import { buildStockSummaryPdf } from '@/lib/reports/pdf'
import { getStockWorkspace } from '@/lib/server/stock'

export const runtime = 'nodejs'

export async function GET() {
  const actor = await requireActor()
  const stock = await getStockWorkspace(actor)
  const pdf = buildStockSummaryPdf(stock, actor)
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="bm-stock-summary.pdf"',
    },
  })
}

