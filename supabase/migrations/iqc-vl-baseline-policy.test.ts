import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202608270001_iqc_vl_baseline_policy.sql'), 'utf8')

describe('IQC VL baseline migration', () => {
  it('adds instrument-scoped baselines and candidate provenance', () => {
    expect(sql).toContain('create table if not exists public.iqc_baselines')
    expect(sql).toContain('create table if not exists public.iqc_baseline_candidates')
    expect(sql).toContain('unique (control_lot_id, analyte_id, instrument_id, version)')
    expect(sql).toContain('iqc_baselines_one_approved_scope')
  })

  it('keeps CoA fields separate from the operational baseline and seeds the VL policy', () => {
    expect(sql).toContain('manufacturer_precision_sd')
    expect(sql).toContain("set policy_profile = 'vl-standard-v1'")
    expect(sql).toContain("active_limit in ('assigned', 'lab', 'baseline')")
  })

  it('protects approval with Admin checks, transaction-scoped recalculation, audit, and RLS', () => {
    expect(sql).toContain("and access.role = 'Admin'")
    expect(sql).toContain("'iqc.result.recalculate'")
    expect(sql).toContain("'iqc.baseline.approve'")
    expect(sql).toContain('alter table public.iqc_baselines enable row level security')
    expect(sql).toContain('grant execute on function public.apply_iqc_vl_baseline')
    expect(sql).toContain('p_lot_evaluations jsonb')
    expect(sql).toContain('Every non-void VL result in the lot must have a recalculated evaluation')
  })

  it('allows Lot Verification to record an approved baseline source', () => {
    expect(sql).toContain("stats_source in ('assigned', 'lab', 'baseline', 'manual')")
  })
})
