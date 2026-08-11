# HIV LAB Alert — Manual Rack Position Selection

## Job and audience

Admin and Staff record a qualifying HIV-VL specimen in HIV LAB Alert. Auto-fill remains the default path, while experienced operators can optionally choose an exact empty HIV DRT rack position.

## Outcome and proof

- The existing Auto-fill preview continues to work without an extra step.
- A `เลือกตำแหน่งเอง` action opens a focused Rack layout dialog for the currently selected Rack.
- The dialog presents all 96 positions (`A1–H12`) in an 8×12 grid.
- Stored/occupied positions are visible but disabled; only empty positions are selectable.
- Confirming the dialog updates the form preview to the selected position. Cancelling or choosing `ใช้ Auto-fill` restores automatic placement.
- The final create transaction validates the requested position while holding the Rack lock. A concurrent operator cannot create duplicate occupancy.

## Selected direction

Use a compact, data-dense operational dialog that preserves the existing teal/white HIV DRT visual language. The form keeps one primary save action; manual position selection is a secondary choice. The grid uses clear cell labels, semantic state colors plus text/legend, visible keyboard focus, and a close/cancel route.

## Scope and boundaries

In scope:

- HIV LAB Alert create form manual-position mode.
- Rack-position selection dialog and responsive layout.
- Request validation from the browser through the API and server DAL.
- Supabase migration for an atomic create RPC that accepts an optional requested position.
- Tests for UI contract, position validation, occupied-position rejection, and transaction safeguards.

Out of scope:

- Changing HIV DRT rack dimensions or position numbering.
- Allowing manual movement of already-stored tubes from HIV LAB Alert.
- Allowing selection of an occupied position.
- Changing the existing HIV DRT Storage UI or Auto-fill behavior outside the Alert create flow.

## Interaction and data flow

1. Staff/Admin selects a Rack. The current Auto-fill position remains visible.
2. The form offers `เลือกตำแหน่งเอง`. If no Rack is selected, the action is disabled and the helper text directs the user to select a Rack first.
3. The dialog receives the selected Rack and its current stored samples from workspace data.
4. Each position is rendered as one keyboard-focusable button when empty, and a disabled button when occupied. The selected cell uses a distinct border/fill and text label.
5. `ยืนยันตำแหน่ง` stores the position in local form state and closes the dialog. `ยกเลิก` leaves the previous mode unchanged. `ใช้ Auto-fill` clears the manual position.
6. Create sends an optional `position` value. The database function locks the requested Rack, checks the position is within 1–96 and not occupied by a stored sample, then inserts the HIV DRT sample and HIV LAB Alert atomically. When no position is supplied, it follows the existing Auto-fill algorithm.
7. Any race, stale workspace, invalid position, or occupied position returns a recoverable error and leaves both tables unchanged.

## Interface and persistence contract

- Extend the HIV LAB Alert create request with optional `position: integer | null`.
- Keep `rackId` required.
- Preserve the existing response/workspace shape and masked-name/privacy rules.
- Replace the current five-argument create RPC with a six-argument version that accepts `p_position integer default null` (drop/recreate the old signature in the migration so there is no ambiguous overload), preserving service-role-only execution.
- Keep the `for update` Rack lock and existing audit behavior; audit only the final numeric position and Rack code, never raw patient identity.

## States and edge cases

- No Rack selected: manual-position button disabled.
- No empty positions: full Rack is not selectable in the form; if the selected Rack becomes full, manual confirmation and create are rejected with a clear recovery message.
- Position occupied after dialog opened: server rejects with `ตำแหน่งนี้มี tube อยู่แล้ว` and the user can reopen the dialog to choose another position.
- Position selected then Rack changes: clear the manual position so it cannot be applied to the wrong Rack.
- Dialog open on mobile: fit within the viewport with a scroll-safe 8×12 grid and actions reachable above the fixed mobile navigation.
- Keyboard: Escape/cancel closes without changing selection; focus remains visible; disabled cells are skipped.

## Verification

- Unit tests cover `A1–H12` mapping, position bounds, occupied-position rejection, and auto-fill fallback.
- UI contract tests verify the optional manual mode, dialog/grid labels, disabled occupied cells, cancel/reset behavior, and preserved Auto-fill path.
- Migration contract tests verify the six-argument RPC, Rack lock, requested-position validation, and service-role grant.
- Run focused HIV tests, ESLint for changed files, `git diff --check`, and `npm run build`.
