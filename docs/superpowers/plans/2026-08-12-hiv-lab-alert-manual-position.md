# HIV LAB Alert Manual Rack Position Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add an optional manual HIV DRT rack-position picker to HIV LAB Alert while preserving Auto-fill as the default and keeping rack allocation atomic.

**Architecture:** Keep the form state nullable (`position: null` means Auto-fill). The workspace API exposes the currently occupied stored positions for each available Rack. A client-side dialog renders the selected Rack as a 8×12 grid and only lets the operator choose an unoccupied cell. The create API passes the optional position to a new server-only RPC. The RPC locks the Rack, validates the requested cell against current stored samples, allocates either the requested cell or the next Auto-fill cell, then inserts the HIV DRT sample and Alert in one transaction.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest, Supabase/PostgreSQL RPC, existing Lucide icons.

## Global Constraints

- Do not change HIV LAB Alert privacy behavior: only masked names are persisted, returned, audited, or sent to LINE.
- Position numbers are row-major `1..96` (`A1..H12`); `null` means Auto-fill.
- Occupied means a `bm_hiv_drt_samples` row for the selected Rack with `status = 'stored'` and a valid `current_position`.
- The server remains authoritative. The UI state is only a convenience and must not bypass the Rack lock or transaction.
- A failed manual allocation must leave both the HIV DRT sample and HIV LAB Alert unchanged and must be retryable.
- Do not run `supabase db push` against a remote project without explicit user approval.
- Preserve existing edit/delete/send behavior and the existing management-menu order.
- Use `apply_patch` for edits and do not include existing `tmp/` artifacts in commits.

---

## Task 1: Lock down position rules and replace the RPC (TDD)

**Files:**

- Modify `lib/hiv-drt/rules.ts`.
- Modify `lib/hiv-drt/rules.test.ts`.
- Modify `supabase/migrations/20260811181333_hiv_lab_alert_manual_position.sql` (the migration scaffold created with `supabase migration new`).
- Modify `supabase/migrations/hiv-lab-alert.test.ts`.

### Step 1: Write the failing domain test

Add `isValidHivDrtPosition(position)` coverage for `1`, `96`, `0`, `97`, and a non-integer. The test must fail before the helper exists.

Run:

```powershell
npm run test -- lib/hiv-drt/rules.test.ts
```

Expected RED: the test cannot import or call `isValidHivDrtPosition`.

### Step 2: Implement the smallest pure helper

Add `isValidHivDrtPosition(position: number): boolean` in `lib/hiv-drt/rules.ts`, using the existing capacity constant and `Number.isInteger`. Keep `formatHivDrtPosition` and `nextHivDrtRackPosition` behavior unchanged.

Run the focused test again and expect GREEN.

### Step 3: Write the failing migration contract test

Extend `supabase/migrations/hiv-lab-alert.test.ts` so it locates `20260811181333_hiv_lab_alert_manual_position.sql` and asserts that the migration:

- drops the five-argument `create_hiv_lab_alert` overload;
- defines the six-argument function with `p_position integer default null`;
- locks the Rack with `for update`;
- validates `p_position` in `1..96`;
- rejects an occupied stored position;
- retains the Auto-fill loop and the no-position error;
- updates `next_position` monotonically;
- grants execution only to `service_role` for the six-argument signature.

Run:

```powershell
npm run test -- supabase/migrations/hiv-lab-alert.test.ts
```

Expected RED: the migration is still empty.

### Step 4: Implement the migration

Use the existing `supabase/migrations/20260811155900_hiv_lab_alert.sql` body as the source of truth. In the new migration:

1. Drop the old five-argument function to avoid an overloaded RPC being selected accidentally.
2. Recreate the function with the same return table and `p_position integer default null`.
3. Lock the selected Rack before inspecting positions.
4. For a non-null position, reject values outside `1..96` and reject a stored sample already occupying that Rack/cell.
5. For null, retain the existing Auto-fill search beginning at the Rack cursor.
6. Insert the HIV DRT sample and Alert with the final allocated position.
7. Advance `next_position` monotonically with `least(97, greatest(old_cursor, allocated_position + 1))`.
8. Revoke/grant the six-argument function so only `service_role` can execute it.

Run the focused migration test and expect GREEN. Also run `supabase migration --help` and `supabase db --help` before any optional local validation; do not push remotely.

### Step 5: Commit the completed task

```powershell
git add lib/hiv-drt/rules.ts lib/hiv-drt/rules.test.ts supabase/migrations/20260811181333_hiv_lab_alert_manual_position.sql supabase/migrations/hiv-lab-alert.test.ts
git commit -m "feat: support manual HIV DRT rack positions"
```

---

## Task 2: Expose occupied positions and validate the API (TDD)

**Files:**

- Modify `lib/hiv-lab-alert/types.ts`.
- Modify `lib/server/hiv-lab-alert.ts`.
- Modify `app/api/hiv-alert/alerts/route.ts`.
- Modify `app/api/hiv-alert/hiv-alert-routes.test.ts`.
- Add or modify `lib/server/hiv-lab-alert.test.ts` if a focused DAL contract test is needed.

### Step 1: Write failing contracts

Add route assertions for `position: z.number().int().min(1).max(96).nullable().optional()` and add a workspace/DAL contract asserting that each Rack returns `occupiedPositions` and that create passes `p_position` to `create_hiv_lab_alert`.

Run the focused route and DAL tests and expect RED.

### Step 2: Extend the workspace type and query mapping

Add `occupiedPositions: number[]` to `HivLabAlertRack`. In `getHivLabAlertWorkspace`, derive it from stored samples belonging to the Rack, filter invalid positions, sort numerically, and return it alongside `nextAutoPosition`. Keep full Rack filtering behavior: the client will hide Racks whose `nextAutoPosition` is null.

### Step 3: Extend server-side create validation and RPC invocation

Accept `position?: number | null` in `createHivLabAlert`. Normalize `undefined` to null and defensively reject non-integer/out-of-range values before calling Supabase. Pass `p_position` to the six-argument RPC. Map database errors for invalid, occupied, and full positions to clear retryable `400/409` `HttpError` messages; do not expose raw patient data or database details.

### Step 4: Extend the request schema

Add the optional nullable position field to `app/api/hiv-alert/alerts/route.ts`. Keep edit requests unchanged because a sent Alert remains locked and manual selection applies only to creation.

Run:

```powershell
npm run test -- app/api/hiv-alert/hiv-alert-routes.test.ts lib/server/hiv-lab-alert.test.ts
```

Expected GREEN.

### Step 5: Commit the completed task

```powershell
git add lib/hiv-lab-alert/types.ts lib/server/hiv-lab-alert.ts lib/server/hiv-lab-alert.test.ts app/api/hiv-alert/alerts/route.ts app/api/hiv-alert/hiv-alert-routes.test.ts
git commit -m "feat: expose HIV rack occupancy to alert form"
```

---

## Task 3: Build the optional manual-position dialog (TDD)

**Files:**

- Modify `components/hiv-lab-alert-view.tsx`.
- Modify `components/hiv-lab-alert-ui.test.ts`.

### Step 1: Write failing UI source contracts

Add assertions that the view:

- keeps `position: number | null` in form state;
- has a `เลือกตำแหน่งเอง` control;
- renders a dialog/grid for `HIV_DRT_RACK_CAPACITY` cells;
- shows occupied cells as disabled;
- provides `ยืนยันตำแหน่ง`, `ยกเลิก`, and `ใช้ Auto-fill` actions;
- sends `position` in the create request and clears it when the Rack changes or Auto-fill is chosen.

Run the focused UI test and expect RED.

### Step 2: Implement dialog state and accessibility

Add a small `RackPositionDialog` component in the same file or a nearby component only if reuse requires it. Use existing project patterns for `role="dialog"`, `aria-modal`, Escape-to-close, backdrop close, focus on the close control, and responsive layout. Do not use emoji as structural icons; use existing Lucide icons.

When the user opens the dialog, initialize the draft to the current manual position or the selected Rack's Auto-fill preview. The draft is not submitted until `ยืนยันตำแหน่ง` is clicked. `ยกเลิก` leaves the form unchanged. `ใช้ Auto-fill` clears the manual position and closes the dialog.

Render positions `1..96` in row-major order, label them with `formatHivDrtPosition`, disable cells in `occupiedPositions`, and provide a compact legend for available, selected, and occupied states. Disable the manual-picker control until a Rack is selected.

### Step 3: Integrate with the existing form

Add `position: null` to `FormState` and `emptyForm`. Reset it when Rack changes. Show the selected manual cell in the existing “ช่องเก็บที่จะใช้” preview; otherwise show the Auto-fill position. Keep the existing full-Rack filtering and main save button behavior. Only the main save submits to the server; opening/selecting a cell must never call LINE.

### Step 4: Run UI tests and commit

```powershell
npm run test -- components/hiv-lab-alert-ui.test.ts
git add components/hiv-lab-alert-view.tsx components/hiv-lab-alert-ui.test.ts
git commit -m "feat: add manual HIV rack position picker"
```

---

## Task 4: Full verification and handoff

### Step 1: Inspect the final diff

```powershell
git diff --check
git status --short --untracked-files=all
git diff HEAD~3..HEAD --stat
```

Confirm the only untracked content left is the pre-existing `tmp/` directory and that it is not staged.

### Step 2: Run all automated checks

```powershell
npm run test
npm run lint
npm run build
```

If a check fails, fix the implementation and rerun the failed check before claiming completion. Do not hide unrelated baseline failures; report them with the command and error.

### Step 3: Verify migration readiness without remote mutation

Use the discovered Supabase CLI help to run only a safe local/static validation that is supported by this installed CLI. Do not run `supabase db push` or alter the hosted database. The handoff must explicitly state that the new migration still needs to be applied to the target Supabase project before the deployed UI can use manual positions.

### Step 4: Final review checklist

- Auto-fill remains the default after Rack selection.
- Manual picker is optional and disabled without a selected Rack.
- Occupied cells are visible but disabled; full Racks are absent from the dropdown.
- Concurrent/manual conflicts fail atomically and can be retried.
- The create request carries only the optional position in addition to existing masked-name inputs.
- No create action calls LINE; LINE remains a separate explicit send action.
- Existing HIV DRT link and Management order remain intact.
- No raw patient name is introduced into responses, audit, or LINE text.

Report changed files, test results, migration application requirement, and any remaining deployment step. Also note that Vercel CLI is not installed if deployment/log inspection is needed; recommend `npm i -g vercel` only as a handoff note, not as part of this local implementation.
