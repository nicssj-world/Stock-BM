import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180010_bm_receipt_assessments.sql'), 'utf8').toLowerCase()

describe('202609180010 receipt assessments', () => {
  it('adds one assessment per receipt linked to receipt and vendor with pending/completed status', () => {
    expect(sql).toContain('create table if not exists public.bm_receipt_assessments')
    expect(sql).toContain('receipt_id uuid not null unique references public.bm_receipts(id)')
    expect(sql).toContain('vendor_id uuid not null references public.bm_vendors(id)')
    expect(sql).toContain("check (status in ('pending','completed'))")
    expect(sql).toContain('assessed_by uuid references public.nipt_users(id)')
  })

  it('has no quantity column — completeness comes from receipt lines', () => {
    const table = sql.slice(sql.indexOf('create table if not exists public.bm_receipt_assessments'), sql.indexOf('create index'))
    expect(table).not.toMatch(/qty|quantity/)
  })

  it('enforces conditional cold chain and the abnormal-note rule in the database', () => {
    expect(sql).toContain('bm_receipt_assessments_cold_chain_scope')
    expect(sql).toContain('bm_receipt_assessments_abnormal_note')
    expect(sql).toContain("nullif(trim(coalesce(note, '')), '') is not null")
  })

  it('creates a pending assessment when a receipt becomes confirmed, without redefining the confirm or ledger functions', () => {
    expect(sql).toContain('after insert or update of status on public.bm_receipts')
    expect(sql).toContain("values (new.id, new.vendor_id, 'pending')")
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.(confirm_bm_receipt|receive_bm_stock)/)
    expect(sql).not.toMatch(/bm_stock_transactions|bm_stock_balances|bm_stock_lots/)
  })

  it('adds barcode evidence columns additively and retires only the OCR tables', () => {
    expect(sql).toContain('add column if not exists barcode_additional_product_id text')
    expect(sql).toContain('add column if not exists barcode_manufacture_date date')
    expect(sql).toContain('add column if not exists barcode_serial text')
    const drops = sql.match(/drop table if exists [a-z_.]+/g) ?? []
    expect(drops).toEqual(['drop table if exists public.bm_ocr_candidates', 'drop table if exists public.bm_ocr_jobs'])
  })

  it('keeps the table service-role only like the other receiving tables', () => {
    expect(sql).toContain('revoke all on table public.bm_receipt_assessments from public, anon, authenticated')
    expect(sql).toContain('grant all on table public.bm_receipt_assessments to service_role')
  })
})
