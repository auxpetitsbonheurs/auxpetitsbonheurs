# S-281: Refuse an order after payment, with the refund step
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/juice-payment.md
Estimate: 3 pts
Owner: remix-specialist, api-engineer

## Story
As the client, I want to refuse an order I cannot make even after it was paid, and be reminded to refund it, so that the customer gets their money back and knows it.

## Acceptance Criteria
- [ ] AC1: Given an awaiting-payment order, when the admin refuses it (optional reason ≤ 500), then it is `declined`, no refund is due, `order_declined` is queued.
- [ ] AC2: Given a paid order (approved or in preparation), when refused, then `refund_due_rs` = total and admin shows "Refund Rs X to the customer by Juice" with Refunded.
- [ ] AC3: Given a refund due, when the admin confirms Refunded, then `refunded_at`/`refunded_by` are set, `refunded` is logged and `order_refunded` queued; a second tap gets INVALID_TRANSITION.
- [ ] AC4: Given a refused order, then tracking shows it refused with the reason and "We are refunding Rs X to you by Juice", then "Refunded Rs X by Juice on <date>".

## Tests
- AC1..AC3 → src/app/server/services/order-payment.server.test.ts
- AC4 → src/app/routes/site/tracking.test.ts

## As built: approve, then pay (Owner decision 2026-11-14)
- Unchanged: Refuse is offered while pending approval, awaiting payment (no refund) and for paid approved / in preparation orders (refund due). The customer may cancel from tracking while pending approval or awaiting payment (unpaid).
