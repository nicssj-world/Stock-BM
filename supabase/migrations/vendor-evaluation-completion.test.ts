import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe,expect,it} from 'vitest'
const sql=readFileSync(join(process.cwd(),'supabase/migrations/202610140001_bm_vendor_evaluation_workflow_completion.sql'),'utf8')
describe('Vendor evaluation follow-up additive migration',()=>{
  it('keeps the approved V1 weights and reports immutable',()=>{
    expect(sql).not.toMatch(/update public\.bm_vendor_evaluation_policies/i)
    expect(sql).not.toMatch(/delete from public\.bm_vendor_annual_evaluation_revisions/i)
    expect(sql).toContain('drop constraint bm_annual_revision_state_check')
    expect(sql).toContain('add constraint bm_annual_revision_state_check check (')
    expect(sql).not.toContain("length(btrim(coalesce(judgment_summary, ''))) > 0")
    expect(sql).toContain("if v_coverage is null or v_coverage < v_policy.minimum_coverage_percent")
    expect(sql).not.toContain('BM_ANNUAL_TEXT_REQUIRED')
    expect(sql).toContain("coalesce(v_rev.judgment_summary, '')")
  })
  it('creates one failed-report follow-up and maintains audit and role guards',()=>{
    expect(sql).toContain('create table if not exists public.bm_vendor_annual_followups')
    expect(sql).toContain('revision_id uuid not null unique')
    expect(sql).toContain("new.frozen_snapshot ->> 'result' = 'fail'")
    expect(sql).toContain("on conflict (revision_id) do nothing")
    expect(sql).toContain("bm_require_role(p_actor,array['Admin'])")
    expect(sql).toContain('p_expected_updated_at')
    expect(sql).toContain("bm_write_audit(p_actor,'vendor.annual.followup.update'")
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('service_role')
  })
})
