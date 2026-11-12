# Portal equipment reference rollout — Stock-BM

Status: **Draft / not deployed**. Branch: `feat/portal-equipment-references-20261112`.
Keep `EQUIPMENT_ARCHIVE_MODE=1` and `bm_equipment_archive_control.enabled=true`.
Do not modify or delete legacy equipment, PM/CAL, IQC results, EQA results or Stock movements.

## Baseline (read-only production snapshot, 12 Nov 2026)
- `bm_equipment`: 17 rows, all 17 with `portal_equipment_id`.
- `bm_equipment_module_links`: 8 rows.
- `bm_stock_item_equipment_links`: 45 rows.
- `iqc_instruments`: 5, 2 with historical equipment mappings.
- Orphan links to Portal: 0. Duplicate IQC links: 0.
- `bm_equipment_archive_control.enabled`: true.

## Verification gates
1. Verify PR files vs latest `main`, run `npm ci`, `npm run lint`, `npm run test`, `npx tsc --noEmit` and `npm run build`.
2. Confirm `STOCK_BM_INTEGRATION_TOKEN` and `PORTAL_EQUIPMENT_API_URL` / `PORTAL_PUBLIC_BASE_URL` are configured server-side in the **correct** Vercel team/project. Never expose token in `NEXT_PUBLIC_*`.
3. Read-only check of current `apply_iqc_vl_baseline` function guard; the migration aborts if its text no longer matches. Back up its definition and current associations.
4. Apply reviewed `supabase/migrations/202611120001_portal_equipment_references.sql` via controlled migration tool. Do **not** rerun old equipment sync or unarchive equipment.
5. Reconcile with read-only SQL:

```sql
select (select count(*) from public.bm_portal_equipment_refs) as portal_refs,
       (select count(*) from public.bm_portal_equipment_links where module in ('iqc','eqa')) as iqc_eqa_links,
       (select count(*) from public.bm_portal_equipment_links where module = 'stock') as stock_links,
       (select enabled from public.bm_equipment_archive_control where singleton = true) as legacy_remains_archived;

select l.module, l.entity_id, l.portal_equipment_id
from public.bm_portal_equipment_links l
left join public.bm_portal_equipment_refs r on r.portal_equipment_id = l.portal_equipment_id
where r.portal_equipment_id is null;

select entity_id, count(*) from public.bm_portal_equipment_links
where module = 'iqc' group by entity_id having count(*) > 1;
```

Expected initial counts: 17 refs, 8 IQC/EQA links and 45 stock links, with no orphans/duplicates and archive still enabled.
6. Test exact LAB-code lookup (valid/invalid/duplicated/inaccessible); ensure unauthorized/Assistant access is denied. No token is returned in browser or logs.
7. Test IQC instrument creation/linking, new QC run, baseline approval, EQA Scheme linking, Stock reagent mapping and Lot Verification filtering. Verify inactive/decommissioned selection behavior.
8. Confirm historical IQC/EQA/Stock records still render, PDFs/reports unchanged, and equipment QR legacy routes remain archived.
9. Deploy through the verified Vercel project only after CI and DB gate success; smoke-check and keep rollback SHA available.

## Rollback
- **Application:** redeploy the previous known-good release if any module regression occurs.
- **Database:** do **not** drop or clear the new reference/link tables on rollback; preserve written mappings for recovery. Restore only the prior baseline approval RPC definition from the verified backup if reverting application semantics requires it.
- Legacy equipment/archive tables are intentionally unchanged throughout rollout.

## Known limitations
- Integration lookup currently fetches a **single exact LAB code**, not a free-text search across all Portal instruments. Cached reference table search supports LAB code, instrument name, model, and serial.
- Cached status is refreshed during exact LAB lookup; a scheduled refresh and endpoint for lightweight Portal status snapshots would be a separate enhancement.
- Source-level review and DB baseline checks are not equivalent to a passing production build, migration execution or UAT.
