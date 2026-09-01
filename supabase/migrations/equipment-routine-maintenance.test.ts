import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609010001_equipment_routine_maintenance_generic.sql'), 'utf8')

describe('generic routine maintenance migration', () => {
  it('creates form, version, and ordered checklist structures', () => {
    expect(sql).toContain('create table if not exists public.bm_equipment_routine_forms')
    expect(sql).toContain('create table if not exists public.bm_equipment_routine_form_versions')
    expect(sql).toContain('create table if not exists public.bm_equipment_routine_form_items')
    expect(sql).toContain("frequency in ('daily', 'weekly', 'monthly', 'yearly')")
    expect(sql).toContain('unique (version_id, position)')
  })

  it('keeps snapshots, nominal dates, sources, and QR idempotency keys', () => {
    expect(sql).toContain('add column if not exists planned_on date')
    expect(sql).toContain("add column if not exists source text not null default 'internal'")
    expect(sql).toContain('add column if not exists idempotency_key uuid')
    expect(sql).toContain("source <> 'qr' or idempotency_key is not null")
    expect(sql).toContain('bm_equipment_routine_maintenance_form_occurrence')
    expect(sql).toContain('bm_equipment_routine_maintenance_idempotency')
    expect(sql).toContain("'itemId', item.id")
    expect(sql).toContain("'label', item.label")
  })

  it('moves holidays and reviews to form scope and preserves FACSLYRIC data', () => {
    expect(sql).toContain('add column if not exists form_id uuid')
    expect(sql).toContain('bm_equipment_routine_holidays_form_date')
    expect(sql).toContain('bm_equipment_routine_holidays_form_fk')
    expect(sql).toContain('bm_equipment_routine_reviews_form_period')
    expect(sql).toContain("'Daily Maintenance'")
    expect(sql).toContain("'Monthly Maintenance'")
    expect(sql).toContain('update public.bm_equipment_routine_maintenance entry')
    expect(sql).toContain('update public.bm_equipment_routine_reviews review')
  })

  it('protects the new tables with RLS and refreshes the API schema cache', () => {
    expect(sql).toContain('alter table public.bm_equipment_routine_forms enable row level security')
    expect(sql).toContain('create policy bm_equipment_routine_forms_read')
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
