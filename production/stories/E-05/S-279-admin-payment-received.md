# S-279: Admin sees orders awaiting payment and marks Payment received
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/juice-payment.md
Estimate: 5 pts
Owner: remix-specialist, api-engineer, ux-lead

## Story
As the client, I want to see which orders wait for payment and how long they have left, and mark one paid in one tap with a safety net, so that confirming a paid order takes seconds.

## Acceptance Criteria
- [ ] AC1: Given orders awaiting payment, when admin opens Orders → Payment, then they are listed oldest first, each with a time-left badge ("12 h left", "45 min left", "Cancelling soon" when overdue).
- [ ] AC2: Given an awaiting-payment order, when the admin taps Payment received, then a confirm step shows the amount and reference; confirming sets `approved`, `paid`, `paid_at`, `paid_by`, bumps `version`, logs `payment_received`, and queues `order_confirmed` for the customer, in one statement.
- [ ] AC3: Given it was just marked paid and nothing else changed, when the admin taps Undo, then the order goes back to `awaiting_payment` unpaid, `payment_undone` is logged and the still-pending `order_confirmed` email is withdrawn.
- [ ] AC4: Given a stale version or a status that no longer allows it, then ORDER_CHANGED or INVALID_TRANSITION and nothing changes.
- [ ] AC5: Given it is paid, when the customer reloads tracking, then the status is Approved, the "Paid" chip shows and the instructions are gone.

## Tests
- AC1 → src/app/domain/payment.test.ts, src/app/routes/admin/orders.test.ts
- AC2, AC3, AC4 → src/app/server/services/order-payment.server.test.ts, src/app/domain/status.test.ts
- AC5 → src/tests/e2e/juice-payment.spec.ts

## As built: approve, then pay (Owner decision 2026-11-14)
- Approve (existing action) now moves `pending_approval` → `awaiting_payment` (table `domain/order-transitions.ts`, PRD Appendix B), sets `awaiting_payment_since` to the approval time, re-arms the reminder, logs `approved` and queues `payment_instructions` (not `order_confirmed`).
- The order screen's Payment section shows, while awaiting payment, a one-tap "Send payment details on WhatsApp" link (the `payment_instructions` template in the order's language); while pending approval it says approving sends the payment details. The sticky action bar is unchanged.
- The Payment tab lists awaiting orders nearest deadline first (the clock runs from approval, not from the order number); time-left badges count from the approval. Today tiles unchanged (To review = pending approval and quote needed; Awaiting payment = approved, unpaid).
- Payment received still confirms (`approved`, paid) and queues `order_confirmed`; Undo unchanged.
- Reusable for other approve-then-pay bookings: `domain/approve-then-pay.ts` (stages, timers) and `server/services/approve-then-pay.server.ts` (approveOrder, markPaid, undoPaid, declineOrder, markRefunded, paymentDeadlines).
- Tests: `approve-order.server.test.ts`, `routes/admin/orders.test.ts`, `order.test.ts`, `order.actions.test.ts`, `tests/e2e/admin-approve.spec.ts`, `juice-payment.spec.ts`, `skeleton-order.spec.ts`.
