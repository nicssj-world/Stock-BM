import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { buildIqcExportWorkbook } from '@/lib/server/iqc-export'
import { exportOrError, todayStamp, xlsxResponse } from '@/lib/server/xlsx-export'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD')

function defaultFrom() {
  const [year, month, day] = todayStamp().split('-').map(Number)
  const from = new Date(Date.UTC(year - 1, month - 1, day))
  return from.toISOString().slice(0, 10)
}

/** GET /api/iqc/export?from=YYYY-MM-DD&to=YYYY-MM-DD — defaults to the last 12 months. */
export async function GET(request: Request) {
  return exportOrError(async () => {
    const params = new URL(request.url).searchParams
    const from = date.parse(params.get('from') || defaultFrom())
    const to = date.parse(params.get('to') || todayStamp())
    const book = await buildIqcExportWorkbook({ from, to }, await requireActor())
    return xlsxResponse(book, `iqc_${from}_${to}.xlsx`)
  })
}
