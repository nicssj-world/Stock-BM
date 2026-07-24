import { requireStockOperator } from '@/lib/server/auth'
import { buildBalancesCsv, buildMovementsCsv } from '@/lib/bm/csv'
import { filterStockWorkspaceByEquipment } from '@/lib/bm/stock-equipment-filter'
import { getStockWorkspace } from '@/lib/server/stock'

export async function GET(request: Request) {
  const actor = await requireStockOperator()
  const stock = await getStockWorkspace(actor)
  const searchParams = new URL(request.url).searchParams
  const report = searchParams.get('report')
  const equipmentId = searchParams.get('equipmentId') ?? 'all'
  const filteredStock = filterStockWorkspaceByEquipment(stock, equipmentId)
  const body = report === 'movements' ? buildMovementsCsv(filteredStock) : buildBalancesCsv(filteredStock)
  const filename = report === 'movements' ? 'bm-stock-movements.csv' : 'bm-stock-balances.csv'
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
