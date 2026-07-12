# HPV Sample Storage Specimen Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store Self-collected or Clinician-collected as a property of each HPV sample, while allowing uninterrupted scanning into a type-neutral storage box.

**Architecture:** A Supabase migration removes `box_type` from storage boxes and adds a constrained `specimen_type` to samples. The typed storage contract, scan endpoint, and persistence layer propagate this field. The client keeps the selected specimen type in the scanning form and renders it as a semantic colour badge wherever individual samples appear.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Supabase Postgres, Zod, Vitest, Tailwind CSS v4.

## Global Constraints

- Before changing any Next.js code, read the relevant guide under `node_modules/next/dist/docs/` and comply with its version-specific guidance.
- Preserve the 5×5 capacity, duplicate-barcode, box-status, position, audit, checkout, and destruction rules.
- Use `self_collected` and `clinician_collected` exactly as the persisted values.
- The deployed database currently has no storage boxes or samples; dropping `box_type` requires no backfill.
- Do not alter unrelated kit-distribution collection types or the protected-route matcher.

---

## File structure

- Create `supabase/migrations/202607130001_hpv_sample_specimen_types.sql`: schema transition and PostgREST schema reload.
- Modify `supabase/migrations/hpv-management.test.ts`: assert the new migration removes box type and constrains sample type.
- Modify `lib/hpv/types.ts`: expose `HpvSpecimenType`; remove `HpvStorageBox.boxType`; add `HpvSample.specimenType`.
- Modify `lib/hpv/rules.ts`: provide specimen-type guard and display labels.
- Modify `lib/hpv/rules.test.ts`: test the type guard and labels.
- Modify `lib/server/hpv.ts`: map and persist the sample field; make box creation type-neutral.
- Modify `app/api/hpv/storage/boxes/route.ts`: accept only a code.
- Modify `app/api/hpv/storage/scan/route.ts`: require and validate `specimenType`.
- Modify `components/hpv-view.tsx`: selected scan type, badges, and removal of box-type copy.
- Create `components/hpv-storage-ui.test.ts`: protect the scan/UI contract.

## Task 1: Make the database transition testable

**Files:**
- Create: `supabase/migrations/202607130001_hpv_sample_specimen_types.sql`
- Modify: `supabase/migrations/hpv-management.test.ts`

**Interfaces:**
- Produces `bm_hpv_samples.specimen_type text not null check (specimen_type in ('self_collected', 'clinician_collected'))`.
- Removes `bm_hpv_storage_boxes.box_type` and its obsolete index.

- [ ] **Step 1: Write the failing migration test**

```ts
const specimenTypeSql = readFileSync(join(process.cwd(), 'supabase/migrations/202607130001_hpv_sample_specimen_types.sql'), 'utf8')

it('moves collection type from storage boxes to individual samples', () => {
  expect(specimenTypeSql).toContain('drop column if exists box_type')
  expect(specimenTypeSql).toContain("add column specimen_type text not null check (specimen_type in ('self_collected', 'clinician_collected'))")
  expect(specimenTypeSql).toContain('drop index if exists public.bm_hpv_storage_boxes_status_type')
  expect(specimenTypeSql).toContain("notify pgrst, 'reload schema'")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- supabase/migrations/hpv-management.test.ts`

Expected: FAIL with `ENOENT` for `202607130001_hpv_sample_specimen_types.sql`.

- [ ] **Step 3: Write the minimal migration**

```sql
drop index if exists public.bm_hpv_storage_boxes_status_type;

alter table public.bm_hpv_storage_boxes
  drop column if exists box_type;

alter table public.bm_hpv_samples
  add column specimen_type text not null check (specimen_type in ('self_collected', 'clinician_collected'));

create index bm_hpv_samples_specimen_type on public.bm_hpv_samples(specimen_type, stored_at desc);

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the targeted migration test**

Run: `npm test -- supabase/migrations/hpv-management.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/202607130001_hpv_sample_specimen_types.sql supabase/migrations/hpv-management.test.ts
git commit -m "feat: store HPV specimen type per sample"
```

## Task 2: Propagate specimen type through the server contract

**Files:**
- Modify: `lib/hpv/types.ts`
- Modify: `lib/hpv/rules.ts`
- Modify: `lib/hpv/rules.test.ts`
- Modify: `lib/server/hpv.ts`
- Modify: `app/api/hpv/storage/boxes/route.ts`
- Modify: `app/api/hpv/storage/scan/route.ts`

**Interfaces:**
- Consumes the `specimen_type` column from Task 1.
- Produces `scanHpvSample({ barcode, boxId, specimenType, position? }, actor)` and sample workspace data containing `sample.specimenType`.

- [ ] **Step 1: Write failing specimen-type rule tests**

```ts
import { isHpvSpecimenType, specimenTypeLabel } from '@/lib/hpv/rules'

it('accepts the two allowed specimen types only', () => {
  expect(isHpvSpecimenType('self_collected')).toBe(true)
  expect(isHpvSpecimenType('clinician_collected')).toBe(true)
  expect(isHpvSpecimenType('mixed')).toBe(false)
})

it('provides staff-facing labels for specimen types', () => {
  expect(specimenTypeLabel('self_collected')).toBe('Self-collected')
  expect(specimenTypeLabel('clinician_collected')).toBe('Clinician-collected')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/hpv/rules.test.ts`

Expected: FAIL with missing exports `isHpvSpecimenType` and `specimenTypeLabel`.

- [ ] **Step 3: Write the minimal typed implementation**

```ts
// lib/hpv/types.ts
export type HpvSpecimenType = 'self_collected' | 'clinician_collected'

export interface HpvSample {
  // existing fields
  specimenType: HpvSpecimenType
}

export interface HpvStorageBox {
  // remove boxType
}

// lib/hpv/rules.ts
export function isHpvSpecimenType(value: unknown): value is HpvSpecimenType {
  return value === 'self_collected' || value === 'clinician_collected'
}

export function specimenTypeLabel(type: HpvSpecimenType) {
  return type === 'self_collected' ? 'Self-collected' : 'Clinician-collected'
}
```

In `lib/server/hpv.ts`, map `specimenType: asString(row.specimen_type) as HpvSpecimenType`, remove box-type mapping and creation input, accept `specimenType` in `scanHpvSample`, insert `specimen_type: input.specimenType`, and include the type in its audit payload. In the scan route require `specimenType: z.enum(['self_collected', 'clinician_collected'])`; in the boxes route remove `boxType` from the Zod schema.

- [ ] **Step 4: Run focused verification**

Run: `npm test -- lib/hpv/rules.test.ts && npx eslint lib/hpv/types.ts lib/hpv/rules.ts lib/hpv/rules.test.ts lib/server/hpv.ts app/api/hpv/storage/boxes/route.ts app/api/hpv/storage/scan/route.ts`

Expected: PASS with no diagnostics for the named files.

- [ ] **Step 5: Commit**

```powershell
git add lib/hpv/types.ts lib/hpv/rules.ts lib/hpv/rules.test.ts lib/server/hpv.ts app/api/hpv/storage/boxes/route.ts app/api/hpv/storage/scan/route.ts
git commit -m "feat: accept HPV specimen type on storage scans"
```

## Task 3: Update continuous scanning and sample badges

**Files:**
- Modify: `components/hpv-view.tsx`
- Create: `components/hpv-storage-ui.test.ts`

**Interfaces:**
- Consumes `HpvSpecimenType`, `specimenTypeLabel`, and `sample.specimenType` from Task 2.
- Sends `{ barcode, boxId, specimenType, position? }` to `POST /api/hpv/storage/scan`.

- [ ] **Step 1: Write the failing UI source-contract test**

```ts
const source = readFileSync(join(process.cwd(), 'components/hpv-view.tsx'), 'utf8')

expect(source).toContain('specimenType, position: selectedPosition')
expect(source).toContain('<option value="self_collected">Self-collected</option>')
expect(source).toContain('<option value="clinician_collected">Clinician-collected</option>')
expect(source).not.toContain('box.boxType')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- components/hpv-storage-ui.test.ts`

Expected: FAIL because the selector and payload are absent and `box.boxType` is still present.

- [ ] **Step 3: Implement the focused storage interface**

```tsx
const [specimenType, setSpecimenType] = useState<HpvSpecimenType>('self_collected')

<Field label="Specimen type">
  <Select value={specimenType} onChange={(event) => setSpecimenType(event.target.value as HpvSpecimenType)}>
    <option value="self_collected">Self-collected</option>
    <option value="clinician_collected">Clinician-collected</option>
  </Select>
</Field>
```

Keep this state after every successful scan, remove box type from the open-box form, open-box selector, box table, and panel heading, then add a local `SpecimenTypeBadge`: teal for `self_collected`, amber for `clinician_collected`. Render it in every occupied grid cell, BoxPanel sample row, sample search result, stored checkout row, and checkout-history row. Replace old box labels with `specimenTypeLabel(sample.specimenType)`.

- [ ] **Step 4: Verify the UI contract and compilation**

Run: `npm test -- components/hpv-storage-ui.test.ts && npx eslint components/hpv-view.tsx && npm run build`

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```powershell
git add components/hpv-view.tsx components/hpv-storage-ui.test.ts
git commit -m "feat: show HPV specimen types in storage"
```

## Task 4: Release-quality verification

**Files:**
- Verify all files from Tasks 1–3; no new implementation files.

**Interfaces:**
- Verifies the migration, typed scan API, and Storage/Checkout UI path.

- [ ] **Step 1: Review for unintended storage-box type references**

Run: `git diff HEAD --check; rg -n "boxType|box_type" app components lib supabase/migrations`

Expected: only unrelated kit-distribution type references remain; storage-box schema, mapping, API, and UI references are gone.

- [ ] **Step 2: Run all automation**

Run: `npm test && npm run build`

Expected: all tests pass and Next.js completes production type checking.

- [ ] **Step 3: Run manual acceptance after applying the migration**

1. Open a storage box using a code only.
2. Select Self-collected, scan two unique barcodes, and confirm both samples receive teal Self-collected badges.
3. Switch to Clinician-collected without changing boxes, scan a third barcode, and confirm only the third sample receives the amber badge.
4. Search and checkout both types; confirm each sample’s type appears and no box type is shown.

- [ ] **Step 4: Confirm the working tree**

Run: `git status --short`

Expected: no uncommitted changes from this feature after the Task 1–3 commits.

