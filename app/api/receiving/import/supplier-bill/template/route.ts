import { requireStockOperator } from '@/lib/server/auth'
import { respond } from '@/lib/server/route'
import { buildSupplierBillTemplate } from '@/lib/server/supplier-bill-xlsx'

/** Blank supplier Bill workbook in the exact import format (worksheet "Bill", 9 columns). */
export async function GET() {
  try {
    await requireStockOperator()
  } catch (error) {
    return respond(async () => { throw error })
  }
  const bytes = await buildSupplierBillTemplate()
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="supplier-bill-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
