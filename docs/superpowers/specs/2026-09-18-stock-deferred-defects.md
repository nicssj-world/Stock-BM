# Stock ledger deferred defects

These defects are known in the legacy Stock-BM receive paths and are deliberately
outside the Stock1 Upgrade critical path. The upgrade does not redefine either
legacy RPC.

## M-1 — Legacy supplier text is silently discarded

### Reproduction

The legacy receive flow accepts supplier text in all three layers:

1. `components/transaction-view.tsx` collects the Supplier field.
2. `app/api/stock/receipts/route.ts` validates and passes `supplier`.
3. `lib/server/stock.ts:receiveStock` sends `p_supplier_text` to
   `public.receive_bm_stock`.

The RPC signature in
`supabase/migrations/202606120001_bm_stock_v1.sql` accepts
`p_supplier_text`, but its transaction insert writes only
`transaction_type`, `reference_text`, `note`, and `created_by`. The existing
`bm_stock_transactions` table has no supplier column, and the parameter is not
written to another table.

### Impact

A user can complete a legacy receive while believing the supplier was recorded,
but the supplier value cannot be recovered from the resulting transaction.
This is an audit and traceability defect. It does not affect the authoritative
ledger quantity or balance.

### Preconditions for a separate fix

- Choose and document the durable destination for the value (the Stock1 path
  uses `bm_receipts.vendor_id` instead of this free-text parameter).
- Treat the fix as a standalone maintenance change to a live RPC, with its own
  migration, real-Postgres behavioural tests, and staging reconciliation.
- Confirm that the legacy Receive API and UI contract remain compatible before
  any production rollout.

No Stock1 task depends on this fix, so it remains deferred.

## M-2 — Legacy bundle receive locks lots in input order

### Reproduction

`public.receive_bm_stock_bundle` in
`supabase/migrations/202607090004_hpv_kit_returns.sql` validates each line and
executes `select ... from public.bm_stock_lots where id = v_line.lot_id for
update` in the order supplied in `p_lines`.

Run two simultaneous HPV returns that use the same two lots in opposite order:

- Session A: `[lot_a, lot_b]`
- Session B: `[lot_b, lot_a]`

After each session obtains its first row lock, each waits for the row held by
the other. PostgreSQL can detect this as a deadlock and abort one transaction.

### Impact

The operation can fail under the rare concurrent HPV-return pattern. A failed
transaction rolls back its own writes, so the defect is an availability and
operator-retry issue rather than a second balance system or a known ledger
corruption path.

The Stock1 confirm path does not inherit this risk: its new RPC acquires all
affected lot locks in UUID order before calling the existing bundle RPC. The
legacy function remains unchanged so the existing HPV return path is preserved.

### Preconditions for a separate fix

- Run a genuine two-session PostgreSQL concurrency test, including both input
  orderings and the existing HPV return regression.
- Define the production retry/lock-ordering policy and verify it against the
  current function signature.
- Apply the change as a standalone live-RPC maintenance migration with staging
  reconciliation and a documented rollback/operational recovery procedure.

No Stock1 task depends on changing this function, so it remains deferred.
