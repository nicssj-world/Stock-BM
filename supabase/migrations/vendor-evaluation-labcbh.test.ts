import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'supabase/migrations')
const read = (name: string) => readFileSync(join(dir, name), 'utf8')
const foundation = read('202609250001_bm_vendor_evaluation_foundation.sql')
const policy = read('202609250002_bm_vendor_evaluation_policy.sql')
const annual = read('202609250003_bm_vendor_annual_evaluation.sql')
const all = [foundation, policy, annual].join('\n')

describe('LABCBH vendor evaluation migrations', () => {
  it('follow the schema pattern: RLS read policy, no application-role grants, service role only', () => {
    for (const table of ['bm_vendor_evaluation_settings', 'bm_receipt_event_numbers', 'bm_receipt_assessment_revisions', 'bm_vendor_evaluation_policies', 'bm_vendor_evaluation_policy_criteria', 'bm_vendor_annual_evaluations', 'bm_vendor_annual_evaluation_revisions']) {
      expect(all, table).toContain(`alter table public.${table} enable row level security`)
      expect(all, table).toContain(`create policy ${table}_active_read`)
      expect(all, table).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
      expect(all, table).toContain(`grant all on table public.${table} to service_role`)
    }
    expect(foundation).toContain("notify pgrst, 'reload schema';")
    expect(policy).toContain("notify pgrst, 'reload schema';")
    expect(annual).toContain("notify pgrst, 'reload schema';")
  })

  it('keeps signatures private: no read policy at all, only definer functions copy them', () => {
    expect(annual).toContain('alter table public.bm_user_signers enable row level security')
    expect(annual).not.toContain('create policy bm_user_signers')
    expect(annual).toContain('revoke all on table public.bm_user_signers from public, anon, authenticated')
  })

  it('never grants a vendor-evaluation function to application roles', () => {
    expect(all).not.toMatch(/grant\s+execute[^;]*to\s+(anon|authenticated|public)/i)
    for (const sql of [foundation, policy, annual]) {
      expect(sql).toContain("revoke all on function public.%s from public, anon, authenticated")
      expect(sql).toContain("grant execute on function public.%s to service_role")
    }
  })

  it('checks the actor and role inside every state-changing function', () => {
    for (const fn of ['create_bm_vendor', 'update_bm_vendor', 'set_bm_vendor_active', 'complete_bm_receipt_assessment', 'revise_bm_receipt_assessment', 'close_bm_invoice_short', 'open_bm_vendor_issue', 'resolve_bm_vendor_issue', 'cancel_bm_vendor_issue']) {
      const body = foundation.slice(foundation.indexOf(`function public.${fn}(`))
      expect(body.slice(0, 900), fn).toContain('bm_require_role(p_actor')
    }
    for (const fn of ['save_bm_vendor_evaluation_policy_proposal', 'approve_bm_vendor_evaluation_policy']) {
      expect(policy.slice(policy.indexOf(`function public.${fn}(`), policy.indexOf(`function public.${fn}(`) + 700), fn).toContain("bm_require_role(p_actor, array['Admin'])")
    }
    for (const fn of ['create_bm_vendor_annual_evaluation_draft', 'save_bm_vendor_annual_evaluation_draft', 'refresh_bm_vendor_annual_evaluation_draft', 'finalize_bm_vendor_annual_evaluation']) {
      expect(annual.slice(annual.indexOf(`function public.${fn}(`), annual.indexOf(`function public.${fn}(`) + 900), fn).toContain("bm_require_role(p_actor, array['Admin'])")
    }
  })

  it('freezes final reports and approved policies', () => {
    expect(annual).toContain('BM_ANNUAL_REVISION_IMMUTABLE')
    expect(annual).toContain('create trigger bm_annual_revisions_guard before update or delete')
    expect(policy).toContain('BM_POLICY_FROZEN')
    expect(policy).toContain('create trigger bm_vendor_evaluation_policies_guard before update or delete')
  })

  it('seeds VE-POLICY-V1 as an unapproved proposal with the LABCBH-Stock numbers', () => {
    expect(policy).toContain("'VE-POLICY-V1', 'proposed', 2569, 80, 80")
    expect(policy).toContain("date '2026-09-23'")
    expect(policy.match(/\('(delivery_completeness|shelf_life|product_packaging|documentation|item_correctness|cold_chain|complaint_performance|corrective_action)', \d, '[^']+', (\d+),/g)?.map((row) => Number(row.match(/, (\d+),$/)![1]))).toEqual([20, 15, 10, 10, 15, 15, 10, 5])
    expect(policy).not.toMatch(/status\s*=\s*'approved'[^;]*insert/i)
  })

  it('refuses to drop the Stock1 evaluation tables when they hold data', () => {
    expect(annual).toContain('Stock1 vendor evaluation tables hold data')
    for (const table of ['bm_vendor_evaluations', 'bm_vendor_eval_document_states', 'bm_vendor_eval_approvals', 'bm_vendor_eval_approver_assignments', 'bm_vendor_eval_policies']) {
      expect(annual).toContain(`from public.${table}`)
      expect(annual).toContain(`drop table if exists public.${table}`)
    }
  })

  it('never edits the migration history that is already applied', () => {
    const names = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
    const mine = names.filter((name) => name.startsWith('20260925'))
    expect(mine).toEqual(['202609250001_bm_vendor_evaluation_foundation.sql', '202609250002_bm_vendor_evaluation_policy.sql', '202609250003_bm_vendor_annual_evaluation.sql'])
    expect(names.at(-1)).toBe(mine.at(-1))
  })
})
