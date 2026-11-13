# S-282: Juice payment journeys end to end on a phone
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/juice-payment.md
Estimate: 2 pts
Owner: test-engineer, ux-lead

## Story
As the team, we want the Juice payment journeys covered end to end at phone widths in both languages, so that a regression in paying or confirming is caught before staging.

## Acceptance Criteria
- [ ] AC1: Place order → instructions with copy buttons and WhatsApp proof link → admin Payment received (confirm) → tracking shows Paid / Approved, at 320, 375 and 1280 px, axe clean.
- [ ] AC2: Unpaid path: the job run with a clock 25 h later cancels the order; admin shows "Cancelled: unpaid", tracking shows the unpaid cancellation.
- [ ] AC3: French: instructions, steps and the WhatsApp text are French.

## Tests
- AC1..AC3 → src/tests/e2e/juice-payment.spec.ts; src/tests/e2e/skeleton-order.spec.ts (Payment received replaces Approve)
