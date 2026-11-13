# S-096: Customer cancels an order while it is pending
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#tracking-actions
Estimate: 3 pts
Owner: remix-specialist, api-engineer, email-specialist

## Story
As a customer who changed my mind, I want to cancel my order from the tracking page while it is still pending, so that the bakery does not prepare it.

## Acceptance Criteria
- [x] AC1 (FR-027): Given an order in Pending approval, when the tracking page loads, then a Cancel button (destructive outline) shows; confirming in the dialog sets status Cancelled, writes a customer `cancelled` event, bumps `version`, queues `cancellation_confirmed` and an admin alert, and the page re-renders as Cancelled.
- [x] AC2 (FR-027): Given an order in Quote needed, when Cancel is confirmed, then it works the same way.
- [x] AC3 (FR-027): Given Approved or any later status, when the tracking page loads, then no Cancel button shows, the text "To change or cancel, message us on WhatsApp. Free cancellation until 48 hours before your order date." and the WhatsApp button show, and a forged `cancel` returns `CANCEL_NOT_ALLOWED`.
- [x] AC4 (FR-027): Given a stale `version` on a still-pending order, when Cancel is posted, then `ORDER_CHANGED` and the page reloads with "This order was updated, please check and try again"; `CANCEL_NOT_ALLOWED` is checked before the version.
- [x] AC5 (FR-027): Given an already cancelled order, when Cancel is posted again, then `CANCEL_NOT_ALLOWED` and the page shows the cancelled state; no second email or event.
- [x] AC6 (FR-027): Given the customer cancels while an admin approves at the same moment, when both commit, then the first committed write wins and the other gets `CANCEL_NOT_ALLOWED` (customer) or `INVALID_TRANSITION` (admin).
- [x] AC7 (FR-027): Given a wrong or unknown token, when `cancel` is posted, then the same 404 and no data change.
- [x] AC8 (FR-027, FR-074 part): Given the email provider is down, when the customer cancels, then the order is still cancelled and the outbox row stays pending for retry.
- [x] AC9 (FR-027): Given customers cannot edit orders, when the tracking page renders, then no edit control exists.
- [x] AC10 (FR-027, NFR-002, NFR-006): Given the Cancel dialog at 320 px and 375 px, 200% zoom and keyboard-only, when used, then focus is trapped and returns to the trigger on close, Esc closes, an inline error is announced, both buttons are labelled ("Cancel order APB-0042", "Keep order"), >= 44 px, contrast AA per `docs/design/tokens.json`.

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

## Implementation notes (2026-11-13, E-05 finish)
- Service: `app/server/services/cancel-order.server.ts`, one statement like approve (guarded UPDATE + event + outbox CTEs). Tests: src/app/server/services/cancel-order.server.test.ts (incl. the concurrent cancel/approve case), src/app/routes/site/tracking.cancel.test.ts, src/tests/e2e/tracking.spec.ts.
- AC1 admin alert: one `admin_alert_customer_cancelled` outbox row per active admin with email alerts on. Push alerts are sent by E-10 (no push sender exists yet).
- Juice payment (parallel work): a **paid** pending order is not cancelled by the button (CANCEL_NOT_ALLOWED; page shows the WhatsApp guidance) because the money has to go back through the payment work's refund step. Since that work landed (contract v0.40), new website orders start in `awaiting_payment`: unpaid, so it is cancellable like Pending approval (`CUSTOMER_CANCELLABLE` in `domain/status.ts`); the cancel records `cancel_reason = 'customer'` next to the 24 h job's `unpaid`.
- AC10 without JavaScript: Cancel is a GET to `?confirm=cancel` that shows the same confirm form inline. That step sets `<meta name="referrer" content="same-origin">`: under `no-referrer` Chrome posts plain forms with `Origin: null`, which React Router's CSRF check refuses. The token still never leaves the site; every other response keeps `Referrer-Policy: no-referrer`.
- AC4: the route revalidates after a 409 (`shouldRevalidate`) so the page shows the current status next to the calm message.
