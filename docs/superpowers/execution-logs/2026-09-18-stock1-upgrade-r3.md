# Stock1 Upgrade Revision 3 — Execution Log

Date: 2026-09-18
Branch: `codex/stock1-upgrade-r3`
Worktree: `D:\Claude workspace\Stock-BM-stock1-upgrade-r3`

## Local implementation gate

- Local Supabase/PostgreSQL harness: PASS.
- `npm run test:db`: PASS (full migration set, L0-1 through L0-14, L0-12, L0-16, L0-17, partial receiving, vendor checks, legacy Receive, and HPV return).
- Local Next.js server: `npm run dev` PASS at `http://localhost:3000`.
- The local Supabase API used the disposable local TLS certificate; `NODE_TLS_REJECT_UNAUTHORIZED=0` was scoped to local test processes only.
- No staging or production endpoint was used.

## Local Phase 1 acceptance walkthrough

Authenticated local HTTP requests exercised the real Next.js route handlers and local Supabase database.

| Check | Result |
| --- | --- |
| `/receiving` and gated APIs with `is_enabled=false` | PASS — page and APIs returned 404 |
| `/receiving` and receiving APIs with `is_enabled=true` | PASS — page/workspace returned 200 |
| Vendor Master create/edit/deactivate/reactivate | PASS |
| Manual multi-line receipt draft | PASS — two lines |
| Existing lot | PASS |
| New lot | PASS |
| Existing-lot expiry mismatch | PASS — 409; existing expiry remained unchanged |
| Expiry greater than six calendar months | PASS — `+6 months +1 day` confirmed |
| Exactly six calendar months | PASS — `NOT_COMPLIANT` |
| Expiry exception while disabled | PASS — confirmation blocked with P-01/P-02 message; draft remained draft |
| Packaging and temperature capture | PASS — `acceptable`, `4.2 C` persisted |
| Expected versus received | PASS |
| Partial receiving | PASS — 8 + 2 = 10; invoice remained `open` |
| Receipt history | PASS |
| Printable receipt report | PASS — Thai content, print button, and evidence appeared |
| Receipt evidence attachment | PASS — upload, list, and report visibility |
| Invoice closure policy gate | PASS — expected HTTP 501 |
| Legacy `/movements?mode=receive` page and Receive API | PASS |

The local ledger assertion observed the existing fixture lot balance at 11 after the two new-workflow partial receipts and the separate legacy receive. No second balance or ledger system was introduced.

## Unperformed UI/device checks

- Visual browser walkthrough was not available in this execution environment; the browser automation surface reported no browser.
- Real iPhone Safari, camera scanner, OCR capture, and Vercel preview testing remain outstanding and are release/Phase 2 acceptance work.

## Phase 2 implementation progress

- 2A OCR feasibility spike retirement: PASS — retired runtime/package references were removed, feasibility findings were preserved, and the targeted test passed.
- 2B GS1/HIBC barcode parser: PASS — TDD fixtures cover GS1-128 FNC1, GS1 DataMatrix, `]e0`, HIBC primary/secondary, GTIN/catalog separation, and malformed all-null fallback. `npx vitest run lib/receiving/barcode.test.ts` and `npx tsc --noEmit` passed.
- 2C scanner plumbing: PASS — the shared hook retains the existing code callback contract while exposing symbology, raw bytes, ZXing result metadata, and explicit format hints. Targeted scanner tests and `npx tsc --noEmit` passed.

## Release gate

Stock-BM has no staging Supabase environment. Staging reconciliation is therefore deferred to the pre-production release gate and must not be replaced by production. No production migration, deployment, or feature-flag change was performed.
