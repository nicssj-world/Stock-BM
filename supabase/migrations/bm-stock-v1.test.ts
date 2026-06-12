import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202606120001_bm_stock_v1.sql'), 'utf8')

describe('BM stock migration', () => {
  it('creates separate BM stock tables linked to nipt_users', () => {
    expect(sql).toContain('create table public.bm_user_access')
    expect(sql).toContain('create table public.bm_stock_items')
    expect(sql).toContain('references public.nipt_users(id)')
  })

  it('keeps movement ledger append-only', () => {
    expect(sql).toContain('create trigger bm_stock_transactions_append_only')
    expect(sql).toContain('create trigger bm_stock_movement_lines_append_only')
    expect(sql).toContain('BM stock ledger is append-only')
  })

  it('does not expose mutating security-definer RPCs to browser roles', () => {
    expect(sql).toContain('revoke all on function public.receive_bm_stock(uuid, text, date, numeric, uuid, text, text, text, text, uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.reverse_bm_stock_transaction(uuid, text, uuid) to service_role')
  })

  it('enforces admin-only adjustment and reversal in SQL', () => {
    expect(sql).toContain("if v_role <> 'Admin' then raise exception 'Admin permission required for stock adjustment'")
    expect(sql).toContain("if v_role <> 'Admin' then raise exception 'Admin permission required for stock reversal'")
  })
})

