import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180003_bm_vendors.sql'), 'utf8')

describe('vendor master migration', () => {
  it('creates the vendor master with a unique code and required identity fields', () => {
    expect(sql).toContain('create table if not exists public.bm_vendors')
    expect(sql).toContain('code text not null unique')
    expect(sql).toContain('name text not null')
    expect(sql).toContain('tax_id text')
    expect(sql).toContain('contact_person text')
    expect(sql).toContain('is_active boolean not null default true')
    expect(sql).toContain('created_by uuid not null references public.nipt_users(id)')
  })

  it('creates the item mapping with scoped uniqueness, foreign keys, and vendor lookup index', () => {
    expect(sql).toContain('create table if not exists public.bm_stock_item_vendors')
    expect(sql).toContain('stock_item_id uuid not null references public.bm_stock_items(id) on delete cascade')
    expect(sql).toContain('vendor_id uuid not null references public.bm_vendors(id) on delete cascade')
    expect(sql).toContain('vendor_catalog_no text')
    expect(sql).toContain('is_preferred boolean not null default false')
    expect(sql).toContain('unique (stock_item_id, vendor_id)')
    expect(sql).toContain('create index if not exists bm_stock_item_vendors_vendor')
    expect(sql).not.toMatch(/insert\s+into\s+public\.bm_stock_items/i)
  })

  it('exposes read-only RLS to application roles and grants table access only to service_role', () => {
    for (const table of ['bm_vendors', 'bm_stock_item_vendors']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`create policy ${table}_active_read`)
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
      expect(sql).toContain(`grant all on table public.${table} to service_role`)
    }
    expect(sql).toContain("notify pgrst, 'reload schema';")
  })
})
