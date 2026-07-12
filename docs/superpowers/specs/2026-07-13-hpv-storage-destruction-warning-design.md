# HPV Storage Destruction Warning Design

## Goal

Keep the existing one-month destruction date for completed HPV storage boxes and warn staff when a box has one to five calendar days remaining.

## Rules

- A destruction due date remains one calendar month after a box becomes full or is manually closed.
- A box with a due date one to five Bangkok calendar days in the future is **due soon**.
- A box with a due date today or earlier is **due now**.
- Destroyed boxes are excluded from both warning counts.
- Open boxes without a due date have no destruction warning.

## Data flow

- Add pure date helpers that compare date-only values in the Bangkok calendar and return the due state.
- Extend the HPV dashboard payload with a `boxesDueSoon` count calculated server-side with `destroy_due_at` from tomorrow through five days ahead.
- Existing `boxesDueDestruction` continues to count due-now boxes only.

## Interface

- Dashboard displays separate status counts for due-soon (amber) and due-now (red).
- Sample Storage shows an amber `เหลือ X วัน` badge in the Storage boxes list and selected box header for due-soon boxes.
- The existing red `Destroy due` badge changes its copy to `ครบกำหนดทำลาย` for due-now boxes.

## Verification

- Unit tests cover exactly five days remaining, six days remaining, today, overdue, and destroyed/open exclusions.
- Verify the focused tests, complete test suite, and production build.
