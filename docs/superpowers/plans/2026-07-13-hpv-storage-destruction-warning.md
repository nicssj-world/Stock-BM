# HPV Storage Destruction Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn staff in the dashboard and HPV Storage boxes when a completed storage box has one to five Bangkok calendar days before its destruction date.

**Architecture:** Reuse the existing date-only Bangkok helpers to derive a destruction state from each box's due date and status. The server returns separate due-soon and due-now dashboard counts; the dashboard and Storage interface render amber or red badges without a schema change.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Supabase Postgres, Vitest, Tailwind CSS v4.

## Global Constraints

- A storage box keeps its current destruction date: one calendar month after it becomes full or is manually closed.
- Due soon means 1–5 Bangkok calendar days remaining; due now means today or overdue.
- Exclude destroyed boxes and open boxes with no due date.
- Do not change the protected-route matcher, database schema, sample storage, or checkout rules.

---

## File structure

- Modify `lib/hpv/types.ts`: add `HpvDestructionState` and `boxesDueSoon` to `HpvDashboard`.
- Modify `lib/bm/rules.ts`: add `bangkokDateKey(dateText)` for timestamps.
- Modify `lib/hpv/rules.ts`: add `getHpvDestructionState(destroyDueAt, status, today?)`.
- Modify `lib/hpv/rules.test.ts`: cover five, six, zero, negative, destroyed, and missing-date cases.
- Modify `lib/server/hpv.ts`: count due-soon and due-now boxes server-side with the shared rule.
- Modify `components/dashboard-view.tsx`: add amber due-soon row and preserve the red due-now row.
- Modify `components/hpv-view.tsx`: use due state for table and selected-box warning badges.
- Create `components/hpv-destruction-warning-ui.test.ts`: lock down the dashboard and Storage warning display.

## Task 1: Add a shared destruction-warning rule and dashboard data

**Files:**
- Modify: `lib/hpv/types.ts`
- Modify: `lib/bm/rules.ts`
- Modify: `lib/hpv/rules.ts`
- Modify: `lib/hpv/rules.test.ts`
- Modify: `lib/server/hpv.ts`

**Interfaces:**
- Produces `type HpvDestructionState = 'none' | 'due_soon' | 'due_now'`.
- Produces `getHpvDestructionState(destroyDueAt: string | null, status: HpvBoxStatus, today?: string): HpvDestructionState`.
- Extends `HpvDashboard` with `boxesDueSoon: number`.

- [ ] **Step 1: Write failing rule tests**

```ts
import { getHpvDestructionState } from '@/lib/hpv/rules'

it('classifies destruction dates in the Bangkok calendar', () => {
  expect(getHpvDestructionState('2026-07-18T00:00:00.000Z', 'full', '2026-07-13')).toBe('due_soon')
  expect(getHpvDestructionState('2026-07-19T00:00:00.000Z', 'full', '2026-07-13')).toBe('none')
  expect(getHpvDestructionState('2026-07-13T00:00:00.000Z', 'full', '2026-07-13')).toBe('due_now')
  expect(getHpvDestructionState('2026-07-12T00:00:00.000Z', 'full', '2026-07-13')).toBe('due_now')
})

it('does not warn for destroyed or undated boxes', () => {
  expect(getHpvDestructionState('2026-07-18T00:00:00.000Z', 'destroyed', '2026-07-13')).toBe('none')
  expect(getHpvDestructionState(null, 'open', '2026-07-13')).toBe('none')
})
```

- [ ] **Step 2: Run the focused test to confirm it fails**

Run: `npm test -- lib/hpv/rules.test.ts`

Expected: FAIL because `getHpvDestructionState` does not exist.

- [ ] **Step 3: Implement the shared state and server counts**

```ts
// lib/hpv/rules.ts
export function getHpvDestructionState(destroyDueAt: string | null, status: HpvBoxStatus, today = todayBangkok()): HpvDestructionState {
  if (!destroyDueAt || status === 'destroyed') return 'none'
  const remaining = daysUntil(bangkokDateKey(destroyDueAt), today)
  if (remaining <= 0) return 'due_now'
  return remaining <= 5 ? 'due_soon' : 'none'
}
```

In `lib/bm/rules.ts`, implement `bangkokDateKey(dateText)` with `Intl.DateTimeFormat` and `timeZone: 'Asia/Bangkok'`. In `getHpvDashboardData`, select `destroy_due_at,status` for boxes with a due date, map each row through `getHpvDestructionState`, and return separate `boxesDueSoon` and `boxesDueDestruction` counts. Add the matching type fields to `lib/hpv/types.ts`.

- [ ] **Step 4: Run rule and server-file verification**

Run: `npm test -- lib/hpv/rules.test.ts && npx eslint lib/hpv/types.ts lib/bm/rules.ts lib/hpv/rules.ts lib/hpv/rules.test.ts lib/server/hpv.ts`

Expected: rule tests pass; report only pre-existing lint diagnostics if any are outside changed lines.

- [ ] **Step 5: Commit**

```powershell
git add lib/hpv/types.ts lib/bm/rules.ts lib/hpv/rules.ts lib/hpv/rules.test.ts lib/server/hpv.ts
git commit -m "feat: classify HPV destruction warnings"
```

## Task 2: Render warnings in dashboard and Storage boxes

**Files:**
- Modify: `components/dashboard-view.tsx`
- Modify: `components/hpv-view.tsx`
- Create: `components/hpv-destruction-warning-ui.test.ts`

**Interfaces:**
- Consumes `hpv.boxesDueSoon`, `hpv.boxesDueDestruction`, and `getHpvDestructionState` from Task 1.

- [ ] **Step 1: Write the failing source-contract test**

```ts
expect(dashboardSource).toContain('hpv.boxesDueSoon')
expect(storageSource).toContain("getHpvDestructionState(box.destroyDueAt, box.status, today)")
expect(storageSource).toContain('เหลือ ${remainingDays} วัน')
expect(storageSource).toContain('ครบกำหนดทำลาย')
```

- [ ] **Step 2: Run the UI test to confirm it fails**

Run: `npm test -- components/hpv-destruction-warning-ui.test.ts`

Expected: FAIL because the due-soon count and warning labels are absent.

- [ ] **Step 3: Implement compact amber and red warnings**

```tsx
const destructionState = getHpvDestructionState(box.destroyDueAt, box.status, today)
const remainingDays = box.destroyDueAt ? daysUntil(bangkokDateKey(box.destroyDueAt), today) : 0

{destructionState === 'due_soon' ? <StatusBadge tone="warning" label={`เหลือ ${remainingDays} วัน`} /> : null}
{destructionState === 'due_now' ? <StatusBadge tone="rejected" label="ครบกำหนดทำลาย" /> : null}
```

Add an amber dashboard row for `hpv.boxesDueSoon` with copy `กล่องใกล้ครบกำหนดทำลาย` and `เหลือไม่เกิน 5 วัน`. Keep the current red due-now row and link to `/hpv` when either count is nonzero. In Storage, render the state badge beside the due date in both the box table and BoxPanel header.

- [ ] **Step 4: Verify UI and production compilation**

Run: `npm test -- components/hpv-destruction-warning-ui.test.ts && npm run build`

Expected: both commands pass.

- [ ] **Step 5: Commit**

```powershell
git add components/dashboard-view.tsx components/hpv-view.tsx components/hpv-destruction-warning-ui.test.ts
git commit -m "feat: warn before HPV box destruction"
```

## Task 3: Release-quality verification

**Files:**
- Verify all files from Tasks 1–2.

- [ ] **Step 1: Inspect warning boundaries**

Run: `rg -n "boxesDueSoon|getHpvDestructionState|ครบกำหนดทำลาย|เหลือ .* วัน" lib components`

Expected: due-soon and due-now state are used only in the intended HPV dashboard and Storage surfaces.

- [ ] **Step 2: Run all automated checks**

Run: `npm test && npm run build && git diff HEAD --check`

Expected: all tests pass, Next.js production build passes, and there are no whitespace errors.

- [ ] **Step 3: Manually verify after a box is full or closed**

1. Set a full box due date to five days ahead and confirm amber warning in Dashboard and Storage.
2. Set it to six days ahead and confirm there is no warning.
3. Set it to today and confirm red `ครบกำหนดทำลาย` warning in both locations.
4. Destroy the box and confirm both dashboard counts exclude it.

- [ ] **Step 4: Confirm working tree state**

Run: `git status --short`

Expected: no uncommitted changes after Task 1 and Task 2 commits.
