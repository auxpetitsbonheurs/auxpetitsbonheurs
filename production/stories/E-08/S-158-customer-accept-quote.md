# S-158: Customer accepts a quote
Status: done
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#ux
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer, accessibility-specialist

## Story
As a customer who received a quote, I want to accept it on the tracking page, so that my cake order is confirmed.

## Acceptance Criteria
- [x] AC1 (FR-031): Given Quote sent and valid, when I tap Accept on the tracking page, then status is Approved, event `quote_accepted` is logged, "Order confirmed" is queued with the Juice number and payment reminder, admins are alerted, and the order shows on the calendar on its date.
- [x] AC2 (FR-031): Given the quote email, then its Accept and Decline buttons open the tracking page and never change state on GET; the tracking page shows amount, note, "Valid until [date]", Accept and Decline.
- [x] AC3 (FR-031): Given `quote_expires_on` is yesterday, when Accept is called, then `QUOTE_EXPIRED` (checked before the version check), status is unchanged, and the page shows "This quote has expired. Send a new request or message us on WhatsApp".
- [x] AC4 (FR-031): Given `quote_expires_on` is today, then Accept succeeds up to 23:59:59 Mauritius time.
- [x] AC5 (FR-031): Given the order is already Approved, Closed or Cancelled (including admin-cancelled after the quote, owner decision 6), when Accept is called again, then `INVALID_TRANSITION`, no second email, and the page shows the current status without buttons.
- [x] AC6 (FR-031): Given the date has since been blocked, then Accept still succeeds (owner decision 10).
- [x] AC7 (FR-031): Given a stale `version` (quote re-sent), then `ORDER_CHANGED` and the page shows "This quote was updated, reload to see the new amount".
- [x] AC8 (FR-031, NFR-003): Given a wrong or malformed token, then "We can't find this order" and a WhatsApp button show with no data; the tracking route is rate limited (RL-track); the amount is read from the server only.
- [x] AC9 (FR-031, NFR-002): Given keyboard and screen reader, then Accept and Decline are real buttons with distinct names ("Accept quote of Rs 4,500", "Decline quote"), status messages are announced, targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and focus moves to the result message after action.
- [x] AC10 (NFR-002, NFR-006): Given 320/375 px, 200% zoom and FR locale, then long French button text wraps without horizontal scroll and the amount and expiry are readable.

## Tests
- AC1 → src/tests/e2e/custom-request.spec.ts
- AC2 → src/app/routes/t.$token.test.tsx
- AC3 → src/app/routes/t.$token.test.tsx
- AC4 → src/app/domain/quote.test.ts
- AC5 → src/app/routes/t.$token.test.tsx
- AC6 → src/app/routes/t.$token.test.tsx
- AC7 → src/app/routes/t.$token.test.tsx
- AC8 → src/app/routes/t.$token.test.tsx
- AC9 → src/tests/e2e/custom-request.a11y.spec.ts
- AC10 → src/tests/e2e/custom-request.a11y.spec.ts

## Notes
- Depends on S-156, E-05 (tracking page and `site/tracking` loader), E-06 (transitions), E-10 (emails).
- Calendar appearance (AC1) relies on E-07 S-136; the e2e runs after both exist.

## Build notes (2026-11-13, E-08 slice 2)
- **AC1 adjusted (payment hand-off, Juice payment S-277..S-282 on main):** Accept moves the order to **Awaiting payment** (not Approved), with `awaiting_payment_since` = now (migration 0016) so the 24 h deadline and 12 h reminder count from the acceptance; the `quote_accepted` email carries how to pay and admins get `admin_alert_quote_accepted`. The tracking page then shows the Juice instructions; the admin's Payment received makes it Approved, queues "Order confirmed" and puts it on the calendar. No second payment model.
- AC2: the quote email's buttons are E-10 (email content); the tracking page never changes state on GET (tested).
- AC8: RL-track counts the answers like `cancel`.
