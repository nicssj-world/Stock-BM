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

## Phase 4 progress

- 4A document model: PASS — additive `bm_vendor_eval_policies`, `bm_vendor_evaluations`, `bm_vendor_eval_document_states`, `bm_vendor_eval_approvals`, and `bm_vendor_eval_approver_assignments` tables mirror the existing revisioned approval pattern. The seeded policy has empty JSON and `is_approved=false`; P-13/P-14 remain unresolved.
- 4B draft generation: PASS — annual evaluation creation freezes the Phase 3 metrics and significant-event evidence into `metrics_snapshot` / `significant_events_snapshot`; `result` and `result_label` are explicitly null. Judgment fields are reviewable and editable.
- 4C review/approve: implemented — evaluator/reviewer/approver signature roles use the existing `SignaturePad` and attachment route. Regenerating a draft increments revision and retains prior approvals as audit rows. A finalised/approved revision cannot be reopened while P-16 is unresolved. P-15 assignment data remains optional and unassigned rather than invented.
- 4D report: implemented — Thai-Buddhist fiscal year label, frozen metrics, judgment, significant events above the result notice, and revision-bound signature blocks are available at `/vendors/evaluations/[id]/report`.
- 4E policy gate: PASS — until an approved policy exists, the UI/report shows `ยังไม่ได้กำหนดสูตรคะแนน — รออนุมัติ`, no numeric result is produced, and no weight literal exists in the vendor implementation directory. P-17 significant events are evidence only and do not change an outcome.
- Real-DB Phase 4 gate: PASS — `npm run test:db` applied 84 migrations and `l0-20-vendor-evaluation.sql` verified empty policy, frozen draft fields, revision bump with prior approval retained, null result, and zero stock-ledger change. Existing L0 checks, including genuinely interleaved L0-16/L0-17, also passed.

## Local implementation status

- Targeted Phase 2–4 tests: PASS — 7 files / 18 tests in the final focused run.
- TypeScript after Phase 4 and OCR ambiguity-selection correction: PASS.
- Production migrations, production data, production deployment, and production feature-flag changes: NOT PERFORMED.

## Local `npm run dev` acceptance after Phase 4

- Disposable local Supabase harness was kept running only for this acceptance pass; no hosted environment was used.
- Authenticated local API/page checks: `/api/vendors`, vendor performance, issue create, issue resolve, annual evaluation create, evaluation page, evaluation print report, and performance CSV all returned 200.
- Evaluation page visibly rendered `ยังไม่ได้กำหนดสูตรคะแนน` while the seeded policy remained unapproved; no result was produced.
- Receiving feature gate: local `is_enabled=false` returned 404 for `/receiving`; local `is_enabled=true` returned 200; it was restored to `false` afterward. `expiry_exception_enabled` remained `false` throughout the final state.
- The local login redirect target used for the HTTP check was a direct protected vendor route; the initial generic `/vendors` target is not a route and produced an expected 404 after authentication, while the authenticated API checks succeeded.

## Release preparation

- `scripts/verify-receiving.mjs` hardened for the owner-approved production-safe gate: explicit `local`/`production` target, `--confirm-production`, backup reference, production read-only reconciliation key, feature-flag fail-closed check, exact item/lot/manufacturer-barcode/balance/transaction/movement-line snapshots, referential-integrity checks, and strict before/after context comparison.
- Local reconciliation harness check: PASS — captured SELECT-only local BEFORE and AFTER snapshots and `--compare` reported `Reconciliation PASS: before and after snapshots are identical.` Production snapshots were not attempted.
- `scripts/db-test.mjs` now supports `STOCK1_KEEP_LOCAL_DB=1` solely to keep the disposable local harness alive for manual `npm run dev` acceptance; it does not alter the normal cleanup behavior.
- Production rollout runbook prepared at `docs/superpowers/release/2026-09-18-stock1-production-safe-release.md`; commands are documentation only and were not executed.
- Browser automation surface was unavailable (`apps=[]`, `browsers=[]`), so visual browser, camera, OCR-worker, real iPhone Safari, and preview-deployment checks remain unperformed.

## Final local verification and READY-FOR-PRODUCTION checkpoint

- Final full `npm test`: 584 passed, 6 failed, 1 skipped across 147 test files. The six failures are the documented pre-existing baseline failures in `components/iqc-data-integrity.test.ts`, `components/iqc-equipment-source.test.ts`, `supabase/migrations/stock-lot-correction.test.ts`, `supabase/migrations/stock-p0-integrity.test.ts`, `supabase/migrations/eqa-capa-parity.test.ts`, and `app/(protected)/reports/stock-summary/report.test.ts`. The Stock1 receiving mutation-boundary test passes after excluding test fixtures from its production-source scan.
- Final `npm run test:db`: PASS. Clean local Postgres applied 84 migrations through `202609180009_bm_vendor_evaluations.sql`; all applicable L0 checks passed, including genuine interleaved L0-16 and L0-17, L0-18 OCR isolation, L0-19 vendor performance, L0-20 vendor evaluation, partial receiving, legacy Receive, and HPV return.
- Final `npx tsc --noEmit`: PASS.
- Final `npm run lint`: FAIL only on the three pre-existing baseline errors in `components/admin-view.tsx:455` and `components/transaction-view.tsx:174,180`, with 16 warnings. Upgrade-owned lint errors were corrected in the vendor pages, crop/scanner UI, and generated OCR assets were excluded from source linting.
- Final `npm run build`: PASS — Next.js 16.2.6/Turbopack compiled, typechecked, generated 121 static pages/routes, and finalized optimization successfully.
- Final `git diff --check`: PASS.
- Local reconciliation tooling remains verified with SELECT-only local BEFORE/AFTER snapshots and a zero-difference `--compare`. No production snapshot, migration, data write, deployment, or flag change was attempted.
- READY-FOR-PRODUCTION checkpoint reached. Execution stops here pending explicit production-release approval; the production-safe runbook is documentation only.
- Vercel CLI is not installed in this environment. If deployment is later approved, install it with `npm i -g vercel` before using `vercel env pull`, `vercel deploy`, or `vercel logs`.

## Final scope change — OCR removed (single-phase final implementation)

**Owner removed OCR from approved Stock1 scope after real-iPhone acceptance testing.**

Final approved workflow: select Vendor → upload/photograph invoice → simple
rectangular crop → select Item / Catalog-REF from Item Master → scan
DataMatrix → Lot/Expiry auto-fill → actual received quantity → review →
confirm (existing `confirm_bm_receipt` path) → Receipt Assessment popup →
assessment feeds Vendor Performance and the Annual Vendor Evaluation.

### Removed / retired

- Tesseract.js dependency, `public/ocr/**` worker/core/wasm/traineddata, OCR
  worker and multi-pass preprocessing, OCR candidate extraction and Catalog
  fuzzy matching, known-lot OCR matching, OCR draft intake, the
  `/api/receiving/ocr/jobs` route, OCR Preview sections and their tests.
- Auto document detection, four-corner perspective crop, corner loupe and
  quadrilateral geometry (`lib/receiving/document-crop.ts`).
- `bm_ocr_jobs` / `bm_ocr_candidates`: migration `202609180007` is left
  unchanged in history; `202609180010` drops the two unused tables
  forward-only. The additive `source`/`ocr_job_id` columns stay as harmless
  history; the API no longer accepts `source: 'ocr'`.
- `lib/receiving/ocr-removed.test.ts` guards against reintroduction.

### Added / completed

- Invoice image = evidence only: library pick or rear-camera capture,
  EXIF-upright decode, touch rectangular crop (pan + corner resize), Reset,
  Skip Crop, Confirm Crop, replace before confirmation. Uploaded through the
  existing attachment route as `stock-receipt` / `invoice-image` before confirm
  and shown on the receipt report.
- Item Master picker (Catalog/REF first; GTIN never matches Catalog/REF).
- GS1 normalization: `]d2` embedded or metadata-only, leading FNC1, ASCII 29,
  textual `<GS>`/`{FNC1}`/`\x1d`/U+241D notations, full GS1 AI-length table so
  extra AIs (91–99, 7003 …) no longer fail a label, empty variable fields
  rejected, DataMatrix raw-codeword fallback. Real fixtures A (Roche TPUC3) and
  B pass; AI 240 is stored as evidence and never copied to Catalog/REF.
- Receiving wizard + production adapter (draft → evidence upload → existing
  confirm RPC). A failed confirm leaves a draft (no duplicate re-submit).
  Packaging/temperature no longer gate confirmation; they moved to the
  post-receipt assessment.
- Receipt Assessment (`bm_receipt_assessments`): created Pending by trigger when
  a receipt becomes confirmed; completed via `PUT
  /api/receiving/receipts/[id]/assessment` (conditional pending→completed
  update). No quantity question — quantity/completeness is read from receipt
  lines. DB constraints enforce the conditional cold-chain answer and the
  abnormal-note rule.
- Vendor Performance now derives product condition, documentation, item
  correctness, cold chain (provisional while P-12 unapproved) and complaints
  from completed assessments; pending assessments are excluded and reported;
  every metric carries drill-down sources; received-vs-expected quantity is
  informational counts only. Complete Delivery stays closure-based and
  provisional (P-06/P-09). Annual evaluation snapshots freeze the same
  metrics + sources; result stays null (P-13/P-14 unapproved).
- Vendor Registry links to each vendor's performance page.
- `/preview/stock1-acceptance` rebuilt around the real wizard, assessment
  dialog and metrics panel with browser-only fixtures (simulated confirm).

### Local verification

- `npx vitest run`: 646 passed, 6 failed (the six documented baseline
  failures only), 1 skipped.
- `npm run test:db`: PASS — all migrations incl. `202609180010`, L0-21
  receipt assessment, legacy Receive, HPV return, partial receiving,
  interleaved L0-12/L0-16/L0-17.
- `npx tsc --noEmit`: PASS. `npm run build`: PASS.
- `npm run lint`: only the three pre-existing baseline errors
  (`components/admin-view.tsx:455`, `components/transaction-view.tsx:174,180`).
- No production migration, data, deployment or flag change.
