import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180001_stock_barcode_tables.sql'), 'utf8')

describe('stock barcode tables migration', () => {
  it('creates additive product and lot barcode tables with scoped uniqueness', () => {
    expect(sql).toContain('create table if not exists public.bm_stock_item_barcodes')
    expect(sql).toContain('stock_item_id uuid not null references public.bm_stock_items(id) on delete cascade')
    expect(sql).toContain('unique (stock_item_id, barcode)')
    expect(sql).toContain('create index if not exists bm_stock_item_barcodes_barcode')
    expect(sql).toContain('create table if not exists public.bm_stock_lot_barcodes')
    expect(sql).toContain('stock_lot_id uuid not null references public.bm_stock_lots(id) on delete cascade')
    expect(sql).toContain('unique (stock_lot_id, barcode)')
    expect(sql).toContain('create index if not exists bm_stock_lot_barcodes_barcode')
  })

  it('backfills legacy values insert-only and preserves the legacy columns and indexes', () => {
    expect(sql).toContain("manufacturer_barcode, 'legacy', created_by")
    expect(sql).toContain('from public.bm_stock_items')
    expect(sql).toContain('from public.bm_stock_lots')
    expect(sql).toContain('on conflict (stock_item_id, barcode) do nothing')
    expect(sql).toContain('on conflict (stock_lot_id, barcode) do nothing')
    expect(sql).not.toMatch(/drop\s+(index|constraint)/i)
    expect(sql).not.toMatch(/update\s+public\.bm_stock_(items|lots)\s+set\s+manufacturer_barcode/i)
    expect(sql).not.toContain('bm_stock_lots_manufacturer_barcode_unique')
    expect(sql).toContain("notify pgrst, 'reload schema';")
  })
})
