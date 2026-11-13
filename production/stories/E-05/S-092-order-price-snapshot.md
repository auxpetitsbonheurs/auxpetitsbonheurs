# S-092: Prices and promotions are copied onto the order
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/pricing-availability-promotions.md#requirements-trace
Estimate: 2 pts
Owner: api-engineer, postgres-specialist

## Story
As the bakery owner, I want each order to keep the prices and promotion it was placed with, so that later menu or promo changes never change an existing order.

## Acceptance Criteria
- [x] AC1 (FR-012): Given an order is placed, when stored, then each `order_item` holds the name, chosen options, unit price, original unit price, quantity and line total, and the order holds items total, delivery fee and total.
- [x] AC2 (FR-012): Given an existing order, when the product's base price or an option price is later changed, then the order's items and total are unchanged on detail and tracking.
- [x] AC3 (FR-012, FR-017): Given a line priced with a promotion, when stored, then `order_item.promotion_id` references the applied promotion; given none applies, then it is null.
- [x] AC4 (FR-012): Given the product is later deleted, when the order is viewed, then items still show from the snapshot (FK SET NULL).
- [x] AC5 (FR-012): Given the stored line total, when a negative value is inserted directly, then the DB CHECK (>= 0) rejects it.
- [x] AC6 (FR-012): Given the placement writes, when the transaction fails midway, then no order, items or number remain (all-or-nothing).

## Tests
- AC1 → src/app/server/services/place-order-options.server.test.ts
- AC2 → src/app/server/services/place-order-options.server.test.ts
- AC3 → src/app/server/services/place-order-options.server.test.ts
- AC4 → src/app/server/services/place-order-options.server.test.ts
- AC5 → src/app/server/services/place-order-options.server.test.ts
- AC6 → src/app/server/services/place-order-options.server.test.ts

## Notes
- No UI. Complements S-091. Test run against a local test database, never a shared one.

## Done notes (2026-11-13, Sprint 4 job 1)
- Migration `src/drizzle/0010_place_order_options.sql` (additive): `order_line_price` + `place_order` body with options; no table change (the columns existed). Unit price = `unit_base_price_rs` + options (data-model.md), line total stored.
- AC3: no promotion engine yet (S-082), so every item stores `promotion_id` NULL; the "references the applied promotion" half is exercised when S-082 passes one.
- Tests as built: all in `src/app/server/services/place-order-options.server.test.ts` (AC5 included; the procedure and domain/pricing are asserted never to drift).
