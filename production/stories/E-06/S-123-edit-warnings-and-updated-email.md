# S-123: Edit warnings and the "Your order was updated" email trigger
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#acceptance-criteria
Estimate: 3 pts
Owner: api-engineer, remix-specialist, email-specialist

## Story
As an admin, I want to save an edit even to a blocked or too-soon date, with a warning, and have the customer told when the date or total changes, so that I stay flexible and the customer is never surprised.

## Acceptance Criteria
- [ ] AC1 (FR-053, FR-056): Given an edit to a blocked date, when saved, then it succeeds with warning `blocked`; a too-soon date gives `too_soon`, a closed day `closed`; warnings show after redirect and never block the save.
- [ ] AC2 (FR-053): Given an edit changing the date from 14 Dec to 15 Dec, when saved, then an `order_updated` email showing the new date is queued in the order's locale.
- [ ] AC3 (FR-053): Given an edit changing the total (including set or clear of an override), when saved, then `order_updated` showing the new total is queued; date and total both changed gives one email with both.
- [ ] AC4 (FR-053): Given an edit changing neither (notes, window, same-total item change), when saved, then no email is queued.
- [ ] AC5 (FR-053): Given an order with no email address, when date or total changes, then no email is queued and the save succeeds.
- [ ] AC6 (FR-053): Given the email provider fails, when saved, then the edit succeeds, an `email_failed` event shows in the log and the outbox retries.
- [ ] AC7 (FR-053): Given the edit event, when stored, then the date/total change, override flag and field diff are in `details`, and the email, event and order rewrite share one transaction.
- [ ] AC8 (FR-053, NFR-002): Given warnings after save, when rendered, then they appear in an Alert (`role=status`) listing each in plain words ("This date is blocked", EN and FR), with the toast "Order updated" and no colour-only meaning; the Alert is reachable by keyboard at 320 px and 375 px.

## Tests
- AC1 → src/app/routes/admin/order-edit.test.ts
- AC2 → src/app/routes/admin/order-edit.email.test.ts
- AC3 → src/app/routes/admin/order-edit.email.test.ts
- AC4 → src/app/routes/admin/order-edit.email.test.ts
- AC5 → src/app/routes/admin/order-edit.email.test.ts
- AC6 → src/app/routes/admin/order-edit.email.test.ts
- AC7 → src/app/routes/admin/order-edit.email.test.ts
- AC8 → src/tests/e2e/admin-order-edit.spec.ts

## Notes
- Email content/template `order_updated` is E-10; this story queues the outbox row. Warning logic from S-083 `adminDateWarnings`. Depends on S-122.

## Implementation notes (2026-11-14)
- Warnings are computed only when the date changed (an unchanged date never warns). They arrive as the redirect's query (`warnings=`) and the order page shows them in a `role=status` Alert, focused, plus the toast.
- AC6: sending and `email_failed` belong to the E-10 outbox sender (on main); the edit only queues the row in the same transaction.
- Tests: `app/server/services/edit-order.server.test.ts` (email rule, one transaction), `app/routes/admin/order-edit.test.ts` (flash), `tests/e2e/admin-order-edit.spec.ts` (warning in words).
