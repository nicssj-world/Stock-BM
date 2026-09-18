# Stock1 Revision 3 — Production-safe release runbook

This runbook is prepared only. It was not executed during implementation.

The owner explicitly waived staging and accepted the associated risk. There is no staging target in this runbook. The only allowed pre-production gate is the approved production-safe procedure below, and it requires explicit release approval before any production migration or deployment.

## 1. Explicit target and backup

Run from the isolated `codex/stock1-upgrade-r3` worktree after confirming the working tree and commit SHA:

```powershell
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Set the production target explicitly. The backup reference must be the identifier from the organisation's approved, recoverable production-backup procedure; the provider-specific backup command is intentionally not invented here.

```powershell
$env:RELEASE_TARGET = 'production'
if ($env:RELEASE_TARGET -ne 'production') { throw 'Refusing to continue: target is not explicitly production.' }
$backupReference = '<approved-recoverable-production-backup-reference>'
$env:PRODUCTION_DB_URL = '<approved-production-database-connection-string>'
$env:NEXT_PUBLIC_BM_SUPABASE_URL = '<approved-production-supabase-url>'
$env:BM_SUPABASE_RECONCILIATION_READONLY_KEY = '<approved-read-only-reconciliation-key>'
New-Item -ItemType Directory -Force .release | Out-Null
```

Verify the backup is recoverable and record `$backupReference` before proceeding. Do not use a service-role key for the production reconciliation variable; `scripts/verify-receiving.mjs` requires `BM_SUPABASE_RECONCILIATION_READONLY_KEY` for `--target production` and performs SELECT-only reads.

## 2. Approved migration preflight

List remote migration history and dry-run the push. Stop if the dry-run contains anything outside the approved Revision 3 migration set or if the target is not the explicitly confirmed production database.

```powershell
npx supabase migration list --db-url $env:PRODUCTION_DB_URL
npx supabase db push --db-url $env:PRODUCTION_DB_URL --dry-run
```

The approved new files, in filename order, are:

```text
202609180001_stock_barcode_tables.sql
202609180002_bm_catalog_index.sql
202609180003_bm_vendors.sql
202609180004_bm_receiving_core.sql
202609180005_bm_receiving_policies.sql
202609180006_bm_receiving_functions.sql
202609180007_bm_ocr.sql
202609180008_bm_vendor_performance.sql
202609180009_bm_vendor_evaluations.sql
```

## 3. Read-only BEFORE snapshot and flag check

```powershell
node scripts/verify-receiving.mjs --before `
  --target production --read-only --confirm-production `
  --backup-reference $backupReference `
  --file .release/stock1-before.json
```

The command fails closed if the production receiving flag or `expiry_exception_enabled` is already on. Review the snapshot for zero referential-integrity violations and the expected existing item/lot identities, balances, transaction history/counts, movement lines, lot expiry, and legacy manufacturer-barcode values.

## 4. Apply only the reviewed migrations

After the dry-run and BEFORE snapshot are approved for this release, apply the pending approved migrations in Supabase migration filename order:

```powershell
npx supabase db push --db-url $env:PRODUCTION_DB_URL --yes
```

Do not run seed flags, `--include-all`, ad-hoc SQL, production data fixes, or any migration outside the reviewed allowlist.

## 5. AFTER snapshot and exact comparison

Keep both controls off and capture the AFTER snapshot with the same backup reference:

```powershell
node scripts/verify-receiving.mjs --after `
  --target production --read-only --confirm-production `
  --backup-reference $backupReference `
  --file .release/stock1-after.json

node scripts/verify-receiving.mjs --compare `
  --target production --read-only --confirm-production `
  --backup-reference $backupReference `
  --before-file .release/stock1-before.json `
  --after-file .release/stock1-after.json
```

`--compare` must report zero differences. Any unexpected difference is a release stop: do not enable receiving, do not enable expiry exceptions, and do not deploy the new workflow.

## 6. Smoke checks, deployment, and flags

After a zero-difference reconciliation, run authenticated smoke checks against the explicit production target:

- legacy `/movements?mode=receive` page and its existing Receive path;
- HPV return workflow/path;
- stock report and printable report;
- protected vendor performance and evaluation pages as read-only pages.

Do not perform a production stock receive or HPV return write as a smoke test unless a separate approved, recoverable test-data procedure exists. Record the smoke evidence and confirm both flags remain off.

The application deployment is a separate explicit approval step. The Vercel CLI is not installed in this worktree; if Vercel CLI deployment is the approved mechanism, install it first and then use the project-approved deployment context:

```powershell
npm i -g vercel
vercel env pull .env.production --environment=production
vercel deploy --prod
```

The deployment must not enable the receiving feature flag or expiry exceptions automatically. After deployment, repeat the read-only legacy/report/vendor smoke checks. The new receiving workflow remains disabled until a later explicit owner decision; expiry exceptions remain disabled pending P-01/P-02; Complete Delivery remains provisional and cannot become a score until P-06/P-09; vendor scoring remains withheld until P-13/P-14.
