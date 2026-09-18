import { requireStockOperator } from '@/lib/server/auth'
import { parseBarcode } from '@/lib/receiving/barcode'
import { matchPackageBarcode, type PackageScanCandidate } from '@/lib/receiving/package-scan'
import { assertReceivingEnabled } from '@/lib/server/receiving'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'
import { readJson, respond } from '@/lib/server/route'
import { z } from 'zod'

const schema = z.object({
  raw: z.string().min(1).max(4000),
  symbologyId: z.string().trim().max(120).nullable().optional(),
  stockItemId: z.string().uuid().nullable().optional(),
})

type RecordRow = Record<string, unknown>

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export async function POST(request: Request) {
  return respond(async () => {
    await requireStockOperator()
    await assertReceivingEnabled()
    const input = await readJson(request, schema)
    const parsed = parseBarcode(input.raw, input.symbologyId ?? null)
    const candidates: PackageScanCandidate[] = []

    if (parsed.gtin) {
      const admin = getAdminClient()
      const { data: barcodeRows, error: barcodeError } = await admin
        .from('bm_stock_item_barcodes')
        .select('stock_item_id,pack_description')
        .eq('barcode', parsed.gtin)
      if (barcodeError) throw new HttpError(500, barcodeError.message)

      const rows = (barcodeRows ?? []) as RecordRow[]
      const itemIds = [...new Set(rows.map((row) => asString(row.stock_item_id)).filter(Boolean))]
      if (itemIds.length) {
        const { data: itemRows, error: itemError } = await admin
          .from('bm_stock_items')
          .select('id,item_code,name,unit,is_active')
          .in('id', itemIds)
          .eq('is_active', true)
        if (itemError) throw new HttpError(500, itemError.message)

        const packByItem = new Map(rows.map((row) => [asString(row.stock_item_id), row.pack_description == null ? null : asString(row.pack_description)]))
        for (const row of (itemRows ?? []) as RecordRow[]) {
          const itemId = asString(row.id)
          candidates.push({
            itemId,
            itemCode: asString(row.item_code),
            name: asString(row.name),
            unit: asString(row.unit),
            packDescription: packByItem.get(itemId) ?? null,
          })
        }
      }
    }

    const resolution = matchPackageBarcode(parsed, candidates, input.stockItemId ?? null)
    return {
      parsed: { ...resolution.parsed, itemId: resolution.itemId },
      match: resolution.match,
      conflicts: resolution.conflicts,
    }
  })
}
