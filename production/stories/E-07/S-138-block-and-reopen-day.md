# S-138: Block and reopen a single day
Status: done
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-calendar-prep.md#behaviour
Estimate: 5 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer, accessibility-specialist

## Story
As an admin, I want to block a day from the calendar and reopen it, so that customers cannot order for a day the bakery is unavailable and existing orders are not touched.

## Acceptance Criteria
- [x] AC1 (FR-059): Given a day with no orders, when I tap "Block this day" in the day sheet, then it is blocked at once without a dialog, the toast "Day blocked" appears with Undo (6 s), and the customer date picker disables that day on the next request.
- [x] AC2 (FR-059): Given a day with 2 active orders, when I tap Block, then a dialog lists both (number, name, window) with "These orders stay as they are. Contact the customers if needed."; on confirm the day is blocked, both keep their status, and the sheet shows the list again as a reminder.
- [x] AC3 (FR-059): Given an optional private reason up to 200 characters, then it is stored and visible to admins; given 201 characters, then `VALIDATION_FAILED`.
- [x] AC4 (FR-059): Given a blocked single day, when I tap "Reopen this day", then the block is removed (toast "Day reopened" with Undo) and the customer date picker allows it again; reopening today is allowed.
- [x] AC5 (FR-059, FR-041): Given a day inside an Owner range block, when an Admin calls `unblockDay`, then the server returns `FORBIDDEN` (`range_block`) and the block remains; the sheet shows "Blocked for the whole period" with no action for Admin and "Blocked by the Owner (range). Change it in Availability." for Owner.
- [x] AC6 (FR-059): Given a past date, when `blockDay` is called, then `VALIDATION_FAILED` on `date`; given an unblocked date, when `unblockDay` is called, then `NOT_FOUND`.
- [x] AC7 (FR-059): Given the date is already blocked, when `blockDay` is called again (two admins), then it is idempotent: `ok`, no duplicate row.
- [x] AC8 (FR-059, FR-015): Given a customer mid-checkout when the day is blocked, then their submit returns `DATE_UNAVAILABLE`; an order placed earlier stays valid.
- [x] AC9 (FR-014): Given a block with private reason "Family event", when a customer opens the date picker, then only the generic "closed/blocked" category shows and the reason is absent from the response.
- [x] AC10 (FR-059): Given a closed weekday (Sunday), then Block and Reopen are hidden.
- [x] AC11 (FR-041, FR-039): Given a customer or anonymous session, then `blockDay` and `unblockDay` are refused; Admin and Owner can block.
- [x] AC12 (NFR-002): Given keyboard and screen reader, then the day sheet and dialog trap focus, restore it on close, Escape closes, the dialog uses `alertdialog` semantics with a destructive-safe default, toast has `role=status` and the Undo button is reachable within its 6 s window (and the action also exists in the sheet).
- [x] AC13 (NFR-002, NFR-006): Given 320/375 px and 200% zoom, then the sheet and dialog fit without horizontal scroll, buttons are 44 px with AA contrast per `docs/design/tokens.json`, the reason field is labelled with a character counter, and blocked state is shown by icon plus word.

## Tests
- AC1 → src/tests/e2e/admin-calendar-block.spec.ts
- AC2 → src/tests/e2e/admin-calendar-block.spec.ts
- AC3 → src/app/routes/admin.calendar.test.tsx
- AC4 → src/app/routes/admin.calendar.test.tsx
- AC5 → src/app/routes/admin.calendar.test.tsx
- AC6 → src/app/routes/admin.calendar.test.tsx
- AC7 → src/app/routes/admin.calendar.test.tsx
- AC8 → src/app/routes/site.checkout.test.tsx
- AC9 → src/app/domain/availability.test.ts
- AC10 → src/app/routes/admin.calendar.test.tsx
- AC11 → src/app/routes/admin.calendar.test.tsx
- AC12 → src/tests/e2e/admin-calendar.a11y.spec.ts
- AC13 → src/tests/e2e/admin-calendar.a11y.spec.ts

## Notes
- Depends on S-136, S-137, E-03 (`blocked_date`, Availability Owner ranges), E-05 (date picker, checkout re-validation). Undo calls the opposite action (spec).
- Owner Q10: late quote acceptance after block is allowed; see E-08 S-158.

## As built (2026-11-14, manual job)
- The "day sheet" is the Day view (`/admin/calendar?view=day&date=`): deep-linkable, works before JavaScript, opened from every month cell. It holds the day's state, Block (optional private reason, counter) / Reopen, the prep list link and the orders.
- Reuses S-057: blocks are `blocked_date` rows (single day = `starts_on = ends_on`), so Availability lists them and the customer date picker / checkout re-check (`DATE_UNAVAILABLE`) honour them; the isolate's Settings cache is cleared on change.
- AC5 adjusted: `unblockDay` refuses a day inside a range for Owners as well (`FORBIDDEN`, `range_block`): one tap must not reopen a whole period; the Owner sees "Change it in Availability" with a link.
- AC12: the confirm is a native modal `<dialog role="alertdialog">` (focus on its title, no button pre-chosen, Escape closes, focus returns); the toast is a `role=status` region whose 6 s timer pauses while focused or hovered.
