import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180004_bm_receiving_core.sql'), 'utf8')

describe('receiving core migration', () => {
  it('creates invoice and receipt event tables without due-date policy fields', () => {
    for (const table of ['bm_invoices', 'bm_invoice_lines', 'bm_receipts', 'bm_receipt_lines']) {
      expect(sql).toContain(`create table if not exists public.${table}`)
    }
    expect(sql).toContain('create unique index if not exists bm_invoices_vendor_no')
    expect(sql).toContain('where invoice_no is not null')
    expect(sql).toContain('stock_transaction_id uuid unique references public.bm_stock_transactions(id)')
    expect(sql).not.toContain('original_due_date')
    expect(sql).not.toContain('revised_due_date')
    expect(sql).not.toContain('revision_reason')
    expect(sql).not.toContain('late_')
  })

  it('keeps every state and justification vocabulary as the approved CHECK lists', () => {
    expect(sql).toContain("status text not null default 'draft' check (status in ('draft','open','closed','cancelled'))")
    expect(sql).toContain("source text not null default 'manual' check (source in ('manual','ocr'))")
    expect(sql).toContain("match_method text check (match_method is null or match_method in ('exact_unique','exact_ambiguous','similar','manual','unmatched'))")
    expect(sql).toContain("closure_state text not null default 'open' check (closure_state in ('open','complete','short_closed','cancelled'))")
    expect(sql).toContain("lot_mode text not null default 'new' check (lot_mode in ('existing','new','not_tracked'))")
    expect(sql).toContain("tor_expiry_compliance text not null default 'not_applicable'")
    expect(sql).toContain("check (tor_expiry_compliance in ('compliant','not_compliant','not_applicable'))")
    expect(sql).toContain("receipt_decision text not null default 'accepted'")
    expect(sql).toContain("check (receipt_decision in ('accepted','accepted_with_justification'))")
    expect(sql).toContain("('urgent_need','consume_before_expiry','no_alternative','approved_by_authority','other')")
  })

  it('contains both mandatory justification constraints and positive quantity checks', () => {
    expect(sql).toContain('constraint bm_receipt_lines_justification_required check (')
    expect(sql).toContain("tor_expiry_compliance <> 'not_compliant'")
    expect(sql).toContain("or receipt_decision = 'accepted_with_justification'")
    expect(sql).toContain('constraint bm_receipt_lines_justification_reason check (')
    expect(sql).toContain("acceptance_reason_code <> 'other'")
    expect(sql).toContain("nullif(trim(coalesce(acceptance_reason_note,'')),'') is not null")
    expect(sql).toContain('expected_qty numeric(14,3) not null check (expected_qty > 0)')
    expect(sql).toContain('received_qty numeric(14,3) not null check (received_qty > 0)')
    expect(sql).toContain("conflicts jsonb not null default '[]'::jsonb")
  })

  it('uses RLS read policies and service-role-only writes for all four tables', () => {
    for (const table of ['bm_invoices', 'bm_invoice_lines', 'bm_receipts', 'bm_receipt_lines']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`create policy ${table}_active_read`)
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
      expect(sql).toContain(`grant all on table public.${table} to service_role`)
    }
  })
})
