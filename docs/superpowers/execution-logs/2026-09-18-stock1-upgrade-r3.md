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
- 2D package barcode scan: PASS — the protected parse route is read-only and flag-gated; GS1/HIBC payloads populate draft-only evidence, unique/ambiguous/no-match outcomes are explicit, and conflicts block use/confirmation. Targeted package-scan tests and `npx tsc --noEmit` passed.

## Recovered approved scope amendment

- Recorded as: **Recovered approved Stock1 requirement omitted from Revision 3: Invoice auto-document crop + manually adjustable four-corner perspective crop.**
- Placement: after barcode/package-scan work and before the Tesseract.js OCR runtime/intake.
- Required release evidence: original-image preservation, auto-detection fallback, four touch-draggable corners, true perspective rectification, explicit confirmation before OCR, skip/reset/retake flows, no stock mutation, and real iPhone Safari verification.
- Invoice image capture/crop implementation: local unit tests PASS for coordinate scaling, corner ordering/reset, perspective input validation, high-contrast detection/fallback, and EXIF orientation mapping. The capture panel is integrated into the invoice editor; real device and preview verification remain outstanding.
- Amended Phase 2 sequencing: this recovered crop requirement is tracked as 2E; the original plan's OCR runtime, dictionary matching, and invoice intake are consequently tracked as 2F, 2G, and 2H for execution evidence. The OCR hand-off is only the confirmed `processedImage` (or an explicitly user-selected skip-crop original), never the unconfirmed original.
- 2F self-hosted browser OCR runtime: PASS — `tesseract.js` 7.0.0 is installed; worker/core and Thai/English LSTM data are copied under `public/ocr/`; the OCR path has same-origin asset tests with no CDN/esm.sh references; downscaling is capped at 1600px; progress and cancellation are wired; and a local Node smoke run recognized an image using the copied language data. Browser-worker and iPhone verification remain outstanding.
- 2G catalog + known-lot dictionaries: PASS — four-outcome matching is pure and ambiguity-safe; duplicate normalized catalogs require a chooser; similar matches remain suggestions; and longer-token false positives return none. Targeted matcher tests and typecheck passed.
- 2H invoice OCR draft intake: PASS — the confirmed processed image is the only OCR input; raw text and candidate lines are reviewable; product descriptions are re-derived from active Item Master rows; the multipart route is operator-authenticated, receiving-flag-gated, Node runtime, and draft-only; `bm_ocr_jobs` / `bm_ocr_candidates` are additive audit tables; L0-18 verified OCR records do not change the ledger; targeted tests and `npm run test:db` passed. Real browser/iPhone OCR acceptance remains outstanding.

## Release gate

Owner policy update recorded: Stock-BM will not create or use a staging Supabase environment. The owner explicitly waived staging and accepted the associated deployment risk. This waiver does not authorize production work during implementation.

The release gate is now production-safe and fail-closed: before any production migration, explicitly confirm the target is production; verify a recoverable production database backup; capture the approved read-only BEFORE reconciliation snapshot; keep the receiving feature flag and `expiry_exception_enabled` false; apply only the approved verified migrations in filename order; capture AFTER; run `--compare`; require zero unexpected differences in existing item/lot integrity, balances, transaction history/counts, movement lines, lot expiry, legacy `manufacturer_barcode` data, and referential integrity; then run legacy Receive, HPV return, and stock-report smoke tests. Any unexpected difference stops release. The production feature flag and expiry exceptions are never enabled automatically.

No production migration, deployment, or feature-flag change was performed.

## Phase 3 progress

- 3A capture completeness: PASS — additive `bm_vendor_issues` and `bm_vendor_significant_events` tables, complaint and documentation-discrepancy types, resolution evidence, and read-only/service-role RLS. The P-12 cold-chain mapping table is present but intentionally empty/unapproved; no storage-condition mapping was invented. No due-date, on-time, or late-attribution fields were added.
- 3B aggregation engine: PASS — Thai fiscal year reuses the established 1 October–30 September implementation; metrics return explicit numerator/denominator/applicable population/exclusions, null for empty ratios, and provisional flags for Complete Delivery and temperature evidence. Open and cancelled lines are excluded from the Complete Delivery denominator and separately reported. Delivery Lead Time is separate informational data and never a scoring input. Unit/guard tests passed.
- 3C dashboard and drill-down: implemented — protected `/vendors/[id]` view renders traceable `n/d` metrics, excluded populations, issue capture/resolution, receipt links, and significant events. No scores are rendered.
- 3D CSV and print report: implemented — `/api/vendors/[id]/performance/export` and `/vendors/[id]/report` use the existing print-page convention. Targeted tests and TypeScript passed; local browser walkthrough remains part of the final `npm run dev` acceptance pass.
- Real-DB Phase 3 gate: PASS — `npm run test:db` applied 83 migrations and `l0-19-vendor-performance.sql` verified issue/resolution/event persistence, empty P-12 mapping, and zero stock-ledger change. Existing L0 checks, including genuinely interleaved L0-16/L0-17, also passed.
