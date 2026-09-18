import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180008_bm_vendor_performance.sql'), 'utf8')

describe('vendor performance evidence migration', () => {
  it('creates evidence tables without inventing P-12 mapping rows', () => {
    expect(sql).toContain('create table if not exists public.bm_receiving_cold_chain_mappings')
    expect(sql).toContain('create table if not exists public.bm_vendor_issues')
    expect(sql).toContain('create table if not exists public.bm_vendor_significant_events')
    expect(sql).toContain("'documentation_discrepancy'")
    expect(sql).toContain("'temperature_out_of_range'")
    expect(sql).not.toMatch(/insert\s+into\s+public\.bm_receiving_cold_chain_mappings/i)
  })

  it('keeps issue resolution evidence explicit and does not add scoring policy', () => {
    expect(sql).toContain('resolution_status text not null default \'open\'')
    expect(sql).toContain('resolved_by uuid references public.nipt_users(id)')
    expect(sql).toContain('resolved_at timestamptz')
    expect(sql).not.toMatch(/weight|score|on.?time|due.?date|late_/i)
  })

  it('uses read-only RLS and service-role writes for every new table', () => {
    for (const table of ['bm_receiving_cold_chain_mappings', 'bm_vendor_issues', 'bm_vendor_significant_events']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`create policy ${table}_active_read`)
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
      expect(sql).toContain(`grant all on table public.${table} to service_role`)
    }
  })
})
