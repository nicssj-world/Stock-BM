import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202607220001_hiv_drt_management.sql'), 'utf8')
const cursorSql = readFileSync(join(process.cwd(), 'supabase/migrations/202607230001_hiv_drt_rack_cursor.sql'), 'utf8')
const repairSql = readFileSync(join(process.cwd(), 'supabase/migrations/202607230002_hiv_drt_cursor_repair.sql'), 'utf8')

describe('HIV DRT migration', () => {
  it('creates 8x12 racks and tube lifecycle storage', () => {
    expect(sql).toContain('create table public.bm_hiv_drt_racks')
    expect(sql).toContain('capacity integer not null default 96 check (capacity = 96)')
    expect(sql).toContain('create table public.bm_hiv_drt_samples')
    expect(sql).toContain("status in ('stored', 'checked_out', 'result_received', 'destroyed')")
  })

  it('protects active positions and moves/swaps them atomically', () => {
    expect(sql).toContain('bm_hiv_drt_samples_active_position')
    expect(sql).toContain('deferrable initially immediate')
    expect(sql).toContain('create or replace function public.move_hiv_drt_sample_position')
    expect(sql).toContain('set constraints public.bm_hiv_drt_samples_active_position deferred')
  })

  it('limits reads to staff/admin and mutations to service role', () => {
    expect(sql).toContain("public.current_bm_role() in ('Admin', 'Staff')")
    expect(sql).toContain('revoke all on function public.move_hiv_drt_sample_position')
    expect(sql).toContain('grant execute on function public.move_hiv_drt_sample_position(uuid, integer, uuid) to service_role')
  })

  it('persists the next auto-fill position and backfills it from rack history', () => {
    expect(cursorSql).toContain('next_position integer not null default 1')
    expect(cursorSql).toContain('max(sample.stored_position) + 1')
    expect(cursorSql).toContain('sample.stored_rack_code = rack.rack_code')
    expect(repairSql).toContain('sample.current_rack_id = rack.id')
    expect(repairSql).toContain('add column if not exists next_position')
    expect(repairSql).toContain('greatest(')
    expect(repairSql).toContain('rack.next_position')
  })
})
