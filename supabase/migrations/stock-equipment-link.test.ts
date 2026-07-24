import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202607240001_stock_item_equipment_link.sql'), 'utf8')

describe('stock item equipment link migration', () => {
  it('supports many registered equipment links per stock item', () => {
    expect(sql).toContain('create table public.bm_stock_item_equipment_links')
    expect(sql).toContain('stock_item_id uuid not null references public.bm_stock_items(id) on delete cascade')
    expect(sql).toContain('equipment_id uuid not null references public.bm_equipment(id) on delete cascade')
    expect(sql).toContain('primary key (stock_item_id, equipment_id)')
  })

  it('keeps the relation protected and service-role writable', () => {
    expect(sql).toContain('alter table public.bm_stock_item_equipment_links enable row level security')
    expect(sql).toContain("using (public.current_bm_role() in ('Admin', 'Staff'))")
    expect(sql).toContain('grant select, insert, update, delete on public.bm_stock_item_equipment_links to service_role')
  })
})
