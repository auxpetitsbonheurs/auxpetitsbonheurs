# S-091: Order submit re-checks dates, products and prices
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#placeorder-pipeline-server-order-is-normative
Estimate: 5 pts
Owner: api-engineer, remix-specialist, ui-engineer

## Story
As a customer, I want the bakery to check my date, items and price when I press Place order, and tell me clearly what changed, so that I am never charged a surprise.

## Acceptance Criteria
- [ ] AC1 (FR-015, FR-011): Given a tampered `displayedTotalRs` or a forged price field, when `placeOrder` runs, then the stored total equals the server calculation or the request is refused with `PRICE_CHANGED`; no client price is ever read.
- [ ] AC2 (FR-015): Given a promotion ended (18:00 Mauritius, fixed clock) after the form opened, when sent, then `PRICE_CHANGED` with repriced `lines`, `itemsTotalRs`, `deliveryFeeRs`, `totalRs`, no order is created, the Alert shows "The price changed from Rs {old} to Rs {new}" and the button reads "Place order at Rs {new}"; the next submit with the new total succeeds.
- [ ] AC3 (FR-015): Given the delivery fee or a product price edited after render, when sent, then the same `PRICE_CHANGED` flow applies (the fee is part of the compared total).
- [ ] AC4 (FR-015): Given a date blocked after the form opened, when sent, then `DATE_UNAVAILABLE` with the reason category only (no private reason), no order, other fields kept.
- [ ] AC5 (FR-015, FR-013): Given a date that is closed, too soon for the largest notice in the basket, or beyond 90 days, when posted, then `DATE_UNAVAILABLE` with reason closed, too_soon or too_far.
- [ ] AC6 (FR-015): Given a sold-out, hidden or out-of-season line, when sent, then `PRODUCT_UNAVAILABLE` lists its `lineId`, no order is created, the line shows an Alert and Remove, and Place order stays blocked until it is removed.
- [ ] AC7 (FR-015): Given an empty basket on submit, then `VALIDATION_FAILED`; given the basket changed in another tab, then the server cookie wins and the page gets `PRICE_CHANGED` or `PRODUCT_UNAVAILABLE`.
- [ ] AC8 (FR-015): Given the pipeline order (parse, idempotency, rate limit and Turnstile, products, date, price, transaction), when a refusal occurs, then nothing is written (no order, number, outbox row) and the refusal is logged with code only.
- [ ] AC9 (FR-015, NFR-002, NFR-006): Given any refusal at 320 px and 375 px, 200% zoom and keyboard-only, when it appears, then a top Alert (`role=alert`) lists each problem as a link to its field, focus moves to it, per-line Alerts are tied to their line, and the old and new price are readable text.
- [ ] AC10 (FR-015): Given the pipeline reuses the E-01 idempotent submit and sequential number allocation, when a refusal happens after key lookup, then the form keeps the same `idempotencyKey` (no order created yet).

## Tests
- AC1 → src/app/routes/site/basket.place-order.test.ts
- AC2 → src/app/routes/site/basket.place-order.test.ts (fixed clock)
- AC3 → src/app/routes/site/basket.place-order.test.ts
- AC4 → src/app/routes/site/basket.place-order.test.ts
- AC5 → src/app/routes/site/basket.place-order.test.ts
- AC6 → src/app/routes/site/basket.place-order.test.ts
- AC7 → src/app/routes/site/basket.place-order.test.ts
- AC8 → src/app/routes/site/basket.place-order.test.ts
- AC9 → src/tests/e2e/checkout-a11y.spec.ts
- AC10 → src/app/routes/site/basket.place-order.test.ts

## Notes
- Builds on E-01 minimal `placeOrder`; this story adds steps 4-6 of the normative pipeline plus the UI states. Depends on S-081, S-082, S-083, S-084.
- Error copy EN/FR via copywriter, no blame wording ("We need 3 days' notice for this cake. The earliest date is ...").
