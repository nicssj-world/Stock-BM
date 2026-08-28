import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260723213000_eqa_annual_reports.sql'), 'utf8')
const signatureSql = readFileSync(join(process.cwd(), 'supabase/migrations/202608280001_eqa_digital_signatures.sql'), 'utf8')

describe('EQA annual report migration', () => {
  it('creates annual plans, occurrences, and revisioned approvals', () => {
    expect(sql).toContain('create table public.eqa_annual_plans')
    expect(sql).toContain('create table public.eqa_plan_items')
    expect(sql).toContain('create table public.eqa_plan_occurrences')
    expect(sql).toContain('create table public.eqa_document_states')
    expect(sql).toContain('unique (document_type, entity_id, revision, approval_role)')
  })

  it('keeps legacy rounds while adding nullable plan linkage and receipt fields', () => {
    expect(sql).toContain('add column if not exists plan_item_id uuid references public.eqa_plan_items(id)')
    expect(sql).toContain('add column if not exists external_sent_date')
  })

  it('stores a drawn signature separately from the account that recorded it', () => {
    expect(signatureSql).toContain('add column if not exists signer_name text')
    expect(signatureSql).toContain('signature_attachment_id uuid references public.bm_attachments(id)')
    expect(signatureSql).toContain('eqa_document_approvals_signature')
  })
})
