import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261119000200_bm_supplier_bill_import.sql'), 'utf8')

describe('supplier Bill import migration', () => {
  it('allows the import receipt source', () => {
    expect(sql).toContain('drop constraint if exists bm_receipts_source_check')
    expect(sql).toContain("check (source in ('manual','ocr','scan','import'))")
  })

  it('keeps one live mapping per vendor code and only service-role writes', () => {
    expect(sql).toContain('create table public.bm_supplier_item_codes')
    expect(sql).toContain("where status in ('pending', 'approved')")
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('grant select on table public.bm_supplier_item_codes to authenticated')
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*to authenticated/)
  })
})
