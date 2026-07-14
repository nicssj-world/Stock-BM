import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202606220001_hpv_management.sql'), 'utf8')
const specimenTypeSql = readFileSync(join(process.cwd(), 'supabase/migrations/202607130001_hpv_sample_specimen_types.sql'), 'utf8')

describe('HPV management migration', () => {
  it('creates HPV site, distribution, receipt, box, and sample tables', () => {
    expect(sql).toContain('create table public.bm_hpv_sites')
    expect(sql).toContain('create table public.bm_hpv_kit_distributions')
    expect(sql).toContain('create table public.bm_hpv_site_receipts')
    expect(sql).toContain('create table public.bm_hpv_storage_boxes')
    expect(sql).toContain('create table public.bm_hpv_samples')
  })

  it('links HPV records to users and stock ledger transactions', () => {
    expect(sql).toContain('references public.nipt_users(id)')
    expect(sql).toContain('stock_transaction_id uuid not null unique references public.bm_stock_transactions(id)')
    expect(sql).toContain('stock_lot_id uuid not null references public.bm_stock_lots(id)')
    expect(sql).toContain('stock_location_id uuid not null references public.bm_stock_locations(id)')
  })

  it('enables RLS read policies for active BM users', () => {
    expect(sql).toContain('alter table public.bm_hpv_sites enable row level security')
    expect(sql).toContain('create policy bm_hpv_samples_active_read')
    expect(sql).toContain('for select using (public.current_bm_role() is not null)')
  })

  it('does not expose HPV mutating SQL functions to browser roles', () => {
    expect(sql).not.toContain('grant execute on function public.hpv')
    expect(sql).not.toContain('to authenticated')
  })

  it('moves collection type from storage boxes to individual samples', () => {
    expect(specimenTypeSql).toContain('drop column if exists box_type')
    expect(specimenTypeSql).toContain("add column specimen_type text not null check (specimen_type in ('self_collected', 'clinician_collected'))")
    expect(specimenTypeSql).toContain('drop index if exists public.bm_hpv_storage_boxes_status_type')
    expect(specimenTypeSql).toContain("notify pgrst, 'reload schema'")
  })
})
