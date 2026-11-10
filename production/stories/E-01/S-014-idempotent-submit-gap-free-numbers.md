# S-014: Double tap creates one order, numbers never skip
Status: review
Epic: E-01-walking-skeleton
Spec: docs/specs/features/checkout-and-tracking.md#edge-cases
Estimate: 3 pts
Owner: api-engineer, postgres-specialist, test-engineer

## Story
As a customer with a slow phone connection, I want a double tap or refresh to send my order only once, so that I am never charged for or promised two cakes by mistake.

## Acceptance Criteria
- [x] AC1 (FR-023): Given two submits with the same `idempotencyKey` sent at the same time, then exactly one order exists, both responses redirect to the same confirmation URL, and exactly one `order_received` outbox row exists.
- [x] AC2 (FR-023): Given a submit whose key already belongs to an order, when it is replayed later (refresh, Back button, a different payload), then the original order's redirect is returned and nothing new is written.
- [x] AC3 (FR-023): Given a race where both requests pass the first lookup, then the unique constraint on `idempotency_key` rolls one back and that request returns the winner's redirect (no error page, no consumed number).
- [x] AC4 (FR-023): Given a validation or price error, then the form re-renders with the same key; given a successful order, then a replay never changes it; the key is a fresh UUID for each new render of the form after an order was created.
- [x] AC5 (FR-024, NFR-013): Given two successful orders in sequence, then their numbers are consecutive (`APB-0007`, `APB-0008`) and a rolled-back attempt consumes no number.
- [x] AC6 (NFR-013): Given 20 concurrent placements, then the 20 numbers are unique and have no gaps.
- [x] AC7 (FR-023): Given the Place order button, then while submitting it shows a loading state, is disabled and keeps its accessible name; given JavaScript is off, the idempotency key still prevents a duplicate on double submit.
- [x] AC8 (FR-023): Given the idempotency key is missing or not a UUID, then `VALIDATION_FAILED` and no order.

## Tests
- AC1 → src/app/server/services/place-order.server.test.ts (parallel calls) and src/tests/e2e/checkout.spec.ts (two simultaneous posts against the local Postgres)
- AC2 → src/app/server/services/place-order.server.test.ts
- AC3 → src/app/server/services/place-order.server.test.ts (transaction barrier forces both past the lookup) and src/tests/e2e/checkout.spec.ts
- AC4 → src/app/routes/site/basket.test.ts
- AC5 → src/app/server/services/place-order.server.test.ts
- AC6 → src/app/server/services/place-order.server.test.ts and src/tests/e2e/checkout.spec.ts (20 concurrent posts against the local Postgres)
- AC7 → src/tests/e2e/checkout.spec.ts (double-click Send, with and without JavaScript)
- AC8 → src/app/server/services/place-order.server.test.ts

## Notes
- Depends on: S-013.
- Number allocation is `UPDATE counter SET value = value + 1 ... RETURNING` inside the order transaction (data-model.md "System tables"); a Postgres sequence was rejected because of gaps.
- Playwright critical journey "double-click Send" (checkout spec) lives here.
- Decision: the key is looked up before the rest of the form is validated, because a Back-button resend after success has an emptied basket cookie and would otherwise be refused instead of redirected (spec step 2 and contracts v0.8 updated).
- Decision: the replay redirect uses the order's stored locale, so "the original order's redirect" is identical from either language.
- Decision: "Postgres container" tests run in the e2e harness against the existing local Postgres (no Docker in unit tests; PGlite serialises connections). They found a real race: two first orders with one new email failed on `customer_email_key`; `resolveGuestCustomer` now inserts with `ON CONFLICT DO NOTHING` and re-reads (customers.server.test.ts).
- Decision: while sending, the button keeps "Place order" as its name (spinner + `aria-busy`, disabled); "Sending your order…" goes to a status region.
