import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202607270001_eqa_capa_parity_and_round_sequence.sql'), 'utf8')

describe('EQA CAPA parity + round sequence migration', () => {
  it('adds IQC-parity ownership and effectiveness columns to eqa_corrective_actions', () => {
    expect(sql).toContain('add column if not exists owner_id uuid references public.nipt_users(id)')
    expect(sql).toContain('add column if not exists due_date date')
    expect(sql).toContain("add column if not exists effectiveness_outcome text not null default 'pending'")
    expect(sql).toContain('add column if not exists effectiveness_note text')
    expect(sql).toContain('add column if not exists effectiveness_verified_by uuid references public.nipt_users(id)')
    expect(sql).toContain('add column if not exists effectiveness_verified_at timestamptz')
  })

  it('adds an effectiveness-outcome check without touching the two-valued status', () => {
    expect(sql).toContain("check (effectiveness_outcome in ('pending', 'effective', 'ineffective'))")
    expect(sql).not.toContain('drop constraint if exists eqa_corrective_actions_status_check')
  })

  it('adds a partial index for open corrective actions with a due date', () => {
    expect(sql).toContain('create index if not exists eqa_corrective_actions_due_open')
    expect(sql).toContain("on public.eqa_corrective_actions(due_date)\n  where status <> 'closed'")
  })

  it('adds a nullable sequence number and partial unique index for generated rounds', () => {
    expect(sql).toContain('add column if not exists sequence_no integer')
    expect(sql).toContain('create unique index if not exists eqa_rounds_plan_item_sequence')
    expect(sql).toContain('where plan_item_id is not null and sequence_no is not null')
  })
})
