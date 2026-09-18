import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180009_bm_vendor_evaluations.sql'), 'utf8')

describe('vendor evaluation migration', () => {
  it('creates the revisioned document and approval model with a seeded unapproved policy', () => {
    for (const table of ['bm_vendor_eval_policies', 'bm_vendor_evaluations', 'bm_vendor_eval_document_states', 'bm_vendor_eval_approvals', 'bm_vendor_eval_approver_assignments']) {
      expect(sql).toContain(`create table if not exists public.${table}`)
    }
    expect(sql).toContain('is_approved boolean not null default false')
    expect(sql).toContain('values (1, (select users.id')
    expect(sql).toContain('metrics_snapshot jsonb not null')
    expect(sql).toContain('unique (evaluation_id, revision, approval_role)')
    expect(sql).toContain("approval_role in ('evaluator','reviewer','approver')")
    expect(sql).not.toMatch(/on.?time|due.?date|late_/i)
  })

  it('keeps result data nullable and leaves policy JSON empty by default', () => {
    expect(sql).toContain("weights jsonb not null default '{}'::jsonb")
    expect(sql).toContain("score_formulas jsonb not null default '{}'::jsonb")
    expect(sql).toContain("result_thresholds jsonb not null default '{}'::jsonb")
    expect(sql).toContain('result numeric')
    expect(sql).toContain('result_label text')
    expect(sql).not.toMatch(/insert\s+into\s+public\.bm_vendor_eval_policies[\s\S]*weights/i)
  })

  it('uses read-only RLS and service-role writes for every evaluation table', () => {
    for (const table of ['bm_vendor_eval_policies', 'bm_vendor_evaluations', 'bm_vendor_eval_document_states', 'bm_vendor_eval_approvals', 'bm_vendor_eval_approver_assignments']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`create policy ${table}_active_read`)
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
      expect(sql).toContain(`grant all on table public.${table} to service_role`)
    }
  })
})
