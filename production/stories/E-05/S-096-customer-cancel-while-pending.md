# S-096: Customer cancels an order while it is pending
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#tracking-actions
Estimate: 3 pts
Owner: remix-specialist, api-engineer, email-specialist

## Story
As a customer who changed my mind, I want to cancel my order from the tracking page while it is still pending, so that the bakery does not prepare it.

## Acceptance Criteria
- [ ] AC1 (FR-027): Given an order in Pending approval, when the tracking page loads, then a Cancel button (destructive outline) shows; confirming in the dialog sets status Cancelled, writes a customer `cancelled` event, bumps `version`, queues `cancellation_confirmed` and an admin alert, and the page re-renders as Cancelled.
- [ ] AC2 (FR-027): Given an order in Quote needed, when Cancel is confirmed, then it works the same way.
- [ ] AC3 (FR-027): Given Approved or any later status, when the tracking page loads, then no Cancel button shows, the text "To change or cancel, message us on WhatsApp. Free cancellation until 48 hours before your order date." and the WhatsApp button show, and a forged `cancel` returns `CANCEL_NOT_ALLOWED`.
- [ ] AC4 (FR-027): Given a stale `version` on a still-pending order, when Cancel is posted, then `ORDER_CHANGED` and the page reloads with "This order was updated, please check and try again"; `CANCEL_NOT_ALLOWED` is checked before the version.
- [ ] AC5 (FR-027): Given an already cancelled order, when Cancel is posted again, then `CANCEL_NOT_ALLOWED` and the page shows the cancelled state; no second email or event.
- [ ] AC6 (FR-027): Given the customer cancels while an admin approves at the same moment, when both commit, then the first committed write wins and the other gets `CANCEL_NOT_ALLOWED` (customer) or `INVALID_TRANSITION` (admin).
- [ ] AC7 (FR-027): Given a wrong or unknown token, when `cancel` is posted, then the same 404 and no data change.
- [ ] AC8 (FR-027, FR-074 part): Given the email provider is down, when the customer cancels, then the order is still cancelled and the outbox row stays pending for retry.
- [ ] AC9 (FR-027): Given customers cannot edit orders, when the tracking page renders, then no edit control exists.
- [ ] AC10 (FR-027, NFR-002, NFR-006): Given the Cancel dialog at 320 px and 375 px, 200% zoom and keyboard-only, when used, then focus is trapped and returns to the trigger on close, Esc closes, an inline error is announced, both buttons are labelled ("Cancel order APB-0042", "Keep order"), >= 44 px, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/site/tracking.cancel.test.ts
- AC2 → src/app/routes/site/tracking.cancel.test.ts
- AC3 → src/app/routes/site/tracking.cancel.test.ts
- AC4 → src/app/routes/site/tracking.cancel.test.ts
- AC5 → src/app/routes/site/tracking.cancel.test.ts
- AC6 → src/app/routes/site/tracking.cancel.test.ts (concurrent)
- AC7 → src/app/routes/site/tracking.cancel.test.ts
- AC8 → src/app/routes/site/tracking.cancel.test.ts
- AC9 → src/app/routes/site/tracking.test.tsx
- AC10 → src/tests/e2e/tracking.spec.ts

## Notes
- Email template content is E-10; this story only queues the outbox row (`cancellation_confirmed`) and admin alert. Customer cancel emails decided yes (spec open question).
- Depends on S-094 and E-01 (order events, outbox).
