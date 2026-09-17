import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180002_bm_catalog_index.sql'), 'utf8')

describe('normalized stock catalog index migration', () => {
  it('adds only the planned generated column and non-unique partial index', () => {
    expect(sql).toContain('alter table public.bm_stock_items add column if not exists catalog_no_normalized text')
    expect(sql).toContain("generated always as (upper(regexp_replace(coalesce(catalog_no,''), '[^A-Za-z0-9]', '', 'g'))) stored")
    expect(sql).toContain('create index if not exists bm_stock_items_catalog_normalized')
    expect(sql).toContain('on public.bm_stock_items(catalog_no_normalized) where catalog_no_normalized <>')
    expect(sql).not.toContain('create unique index')
    expect(sql).not.toMatch(/drop\s+(index|constraint)/i)
    expect(sql).toContain("notify pgrst, 'reload schema';")
  })
})
