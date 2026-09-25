# Vendor evaluation: LABCBH-Stock system adopted as the work group's QP

**Owner decision (2026-09-25):** the work group writes its vendor-evaluation QP after LABCBH-Stock, so Stock-BM uses the same system.
This supersedes the Stock1 evaluation scaffolding and closes the policy holds that were waiting for it:

| Hold | Decision |
|---|---|
| P-06 / P-09 / P-10 (invoice closure, short-close transitions, reason vocabulary) | LABCBH rules: an invoice closes by itself when every line is received in full; an Admin can close it short with a reason, and each outstanding line becomes a `quantity_discrepancy` vendor issue. |
| P-12 (cold-chain mapping) | Replaced: cold chain is answered per receipt in the assessment (`cold_chain_applicable` + condition), as in LABCBH. |
| P-13 / P-14 (weights, formulas, thresholds) | `VE-POLICY-V1` carries the numbers LABCBH-Stock approved (pass 80%, minimum coverage 80%, from fiscal year 2569, weights 20/15/10/10/15/15/10/5). It is seeded as a **proposal**: an Admin must approve it, which records who and freezes it. No score is official before that. |
| P-16 (regenerating an approved evaluation) | Final reports are immutable; a change is a new revision that supersedes the previous one. |

The receiving workflow itself is **not** enabled by this change (`bm_receiving_policies.is_enabled` and `expiry_exception_enabled` are untouched).

## What was built

- **Migrations** `202609250001` (vendor master fields, closing short, receipt event numbers `RC-{พ.ศ.}-{0001}`, assessment reasons and revisions, LABCBH issues), `202609250002` (policy), `202609250003` (positions and signatures, annual evaluation, scoring, retirement of the Stock1 evaluation tables — refuses to run if they hold any row).
- **Database functions** are `security definer`, service-role only, and take `p_actor`, checking the role themselves (`bm_require_role`). Admin: vendor master, close short, revise/resolve/cancel, policy, annual evaluation. Admin or Staff: complete an assessment, open an issue. Assistant: none of these.
- **Pages:** `/vendors/[id]` (performance, annual reports, assessments, issues), `/vendors/[id]/evaluations/[revisionId]`, `/vendors/evaluation-policy`, `/vendors/my-signature`; vendor master stays in Admin → Vendors, positions in Admin → users.
- **PDF:** `/api/vendors/[id]/evaluations/[revisionId]/pdf` (`lib/vendors/annual-pdf.ts`, pdf-lib + TH Sarabun New), the one report that is not a print page (see AGENTS.md).

## Where Stock-BM differs from LABCBH-Stock

- **One lab, no warehouses:** evaluations are per vendor and fiscal year; there is no per-warehouse report.
- **Shelf life** (criterion 2) uses Stock-BM's TOR remaining-shelf-life rule (`tor_expiry_compliance`) instead of "not expired on the receipt date", because TOR is Stock-BM's own expiry rule. A line accepted although it failed TOR opens an `expiry_non_compliant` issue.
- **Delivery** (criterion 1) counts lines of invoices that reached an end state: `complete` (received in full) or `short_closed`. An invoice closed short is `status = 'closed'` with `closed_short_*` stamped.
- **Not-required receipts:** receipts dated before `bm_vendor_evaluation_settings.assessment_required_from` (the day the migration ran) are excluded from scoring.
- **Signatures** are drawn or uploaded in Stock-BM (`bm_user_signers`, PNG data URL, private, copied into the report when it is finalized), not pulled from the Portal. Positions live in the same table because `nipt_users` belongs to a shared identity service.
- **Evidence files** for vendor issues reuse the existing private `bm-quality` bucket through `bm_attachments` (`module = 'stock'`, `entity_type = 'vendor-issue'`), attachable only while the issue is open.

## Production checklist (needs its own approval)

1. Backup and reconcile as in `docs/superpowers/release/2026-09-18-stock1-production-safe-release.md` (verify the Supabase ref, dry run, read-only before/after snapshot).
2. The retirement migration aborts if any Stock1 evaluation/approval/significant-event/cold-chain row exists; check those tables are empty first.
3. `assessment_required_from` is set to the day the migration runs — confirm that cut-off with the owner.
4. Deploy the code with the migrations (old evaluation routes and tables are removed).
5. After deploy an Admin of the work group reviews and approves `VE-POLICY-V1`, people set their position and signature, and one real report is produced and its PDF checked.
