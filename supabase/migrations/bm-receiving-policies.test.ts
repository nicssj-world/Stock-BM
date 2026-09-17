import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180005_bm_receiving_policies.sql'), 'utf8')

describe('receiving policy migration', () => {
  it('creates exactly the two independent gates and no unresolved defaults', () => {
    expect(sql).toContain('create table if not exists public.bm_receiving_policies')
    expect(sql).toContain('is_enabled boolean not null default false')
    expect(sql).toContain('expiry_exception_enabled boolean not null default false')
    expect(sql).toContain('expiry_exception_min_role text')
    expect(sql).toContain('expiry_exception_requires_second_approval boolean')
    expect(sql).toContain('is_approved boolean not null default false')
    expect(sql).not.toContain('tor_threshold_months')
    expect(sql).not.toContain('expiry_exception_evidence_required')
    expect(sql).toContain('values (1, false, false, null, null, false')
  })

  it('keeps the policy table read-protected and writes service-role only', () => {
    expect(sql).toContain('alter table public.bm_receiving_policies enable row level security')
    expect(sql).toContain('create policy bm_receiving_policies_active_read')
    expect(sql).toContain('revoke all on table public.bm_receiving_policies from public, anon, authenticated')
    expect(sql).toContain('grant all on table public.bm_receiving_policies to service_role')
  })
})
