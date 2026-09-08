import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609080001_equipment_routine_response_sets.sql'), 'utf8')

describe('equipment routine response sets migration', () => {
  it('creates global, reusable response-set and option tables', () => {
    expect(sql).toContain('create table if not exists public.bm_equipment_routine_response_sets')
    expect(sql).toContain('create table if not exists public.bm_equipment_routine_response_options')
    expect(sql).toContain('unique (set_id, position)')
    expect(sql).toContain('unique (set_id, value)')
  })

  it('seeds the legacy set with the exact values every existing version already uses', () => {
    expect(sql).toContain("'ทำแล้ว / N/A / ยังไม่ทำ'")
    expect(sql).toContain("(legacy_set, 1, 'done', '✓ ทำแล้ว', '✓')")
    expect(sql).toContain("(legacy_set, 2, 'not-applicable', 'N/A ไม่เกี่ยวข้อง', 'N/A')")
    expect(sql).toContain("(legacy_set, 3, 'not-done', '✕ ยังไม่ทำ', '✕')")
  })

  it('seeds the requested ปกติ / ชำรุด set', () => {
    expect(sql).toContain("'ปกติ / ชำรุด'")
    expect(sql).toContain("(normal_set, 1, 'normal', 'ปกติ', '✓')")
    expect(sql).toContain("(normal_set, 2, 'damaged', 'ชำรุด', '✕')")
  })

  it('links the response set to each checklist item, not the whole version, and backfills existing rows', () => {
    expect(sql).toContain('alter table public.bm_equipment_routine_form_items')
    expect(sql).toContain('add column if not exists response_set_id uuid')
    expect(sql).toContain('alter column response_set_id set not null')
    expect(sql).toContain('bm_equipment_routine_form_items_response_set_fk')
  })

  it('safely repairs a database that already ran the earlier version-level draft of this migration', () => {
    expect(sql).toContain('alter table public.bm_equipment_routine_form_versions')
    expect(sql).toContain('drop column if exists response_set_id')
  })

  it('protects the new tables with RLS and refreshes the API schema cache', () => {
    expect(sql).toContain('alter table public.bm_equipment_routine_response_sets enable row level security')
    expect(sql).toContain('alter table public.bm_equipment_routine_response_options enable row level security')
    expect(sql).toContain('create policy bm_equipment_routine_response_sets_read')
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
