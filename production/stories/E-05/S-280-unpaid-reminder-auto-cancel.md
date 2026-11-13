# S-280: Unpaid orders get a reminder at 12 h and are cancelled at 24 h
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/juice-payment.md
Estimate: 3 pts
Owner: api-engineer, postgres-specialist

## Story
As the client, I want unpaid orders reminded and then cancelled automatically, so that dates are not held by orders nobody pays.

## Acceptance Criteria
- [ ] AC1: Given an order awaiting payment for ≥ 12 h and < 24 h with no reminder yet, when the hourly job runs, then `payment_reminder_sent_at` is set, `payment_reminder` is queued and a system event is logged, once.
- [ ] AC2: Given an order awaiting payment for ≥ 24 h, when the job runs, then it becomes `cancelled` with `cancel_reason = 'unpaid'`, `version` + 1, a system `cancelled` event and `order_cancelled_unpaid` queued; its date is no longer counted (active statuses).
- [ ] AC3: Given the job runs twice at the same time or again later, then nothing is done twice (status-guarded updates, dedupe keys).
- [ ] AC4: Given a fixed clock is injected, then every rule above is judged from it, never the system clock.
- [ ] AC5: Given an unpaid-cancelled order, then admin shows "Cancelled: unpaid" and tracking shows "Cancelled: we did not receive the payment within 24 hours" with WhatsApp.

## Tests
- AC1..AC4 → src/app/jobs/payment-deadlines.test.ts, src/app/jobs/dispatch.test.ts
- AC5 → src/tests/e2e/juice-payment.spec.ts
