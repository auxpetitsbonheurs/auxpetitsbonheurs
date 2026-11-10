# S-092: Prices and promotions are copied onto the order
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/pricing-availability-promotions.md#requirements-trace
Estimate: 2 pts
Owner: api-engineer, postgres-specialist

## Story
As the bakery owner, I want each order to keep the prices and promotion it was placed with, so that later menu or promo changes never change an existing order.

## Acceptance Criteria
- [ ] AC1 (FR-012): Given an order is placed, when stored, then each `order_item` holds the name, chosen options, unit price, original unit price, quantity and line total, and the order holds items total, delivery fee and total.
- [ ] AC2 (FR-012): Given an existing order, when the product's base price or an option price is later changed, then the order's items and total are unchanged on detail and tracking.
- [ ] AC3 (FR-012, FR-017): Given a line priced with a promotion, when stored, then `order_item.promotion_id` references the applied promotion; given none applies, then it is null.
- [ ] AC4 (FR-012): Given the product is later deleted, when the order is viewed, then items still show from the snapshot (FK SET NULL).
- [ ] AC5 (FR-012): Given the stored line total, when a negative value is inserted directly, then the DB CHECK (>= 0) rejects it.
- [ ] AC6 (FR-012): Given the placement writes, when the transaction fails midway, then no order, items or number remain (all-or-nothing).

## Tests
- AC1 → src/app/server/orders/place-order.integration.test.ts
- AC2 → src/app/server/orders/place-order.integration.test.ts
- AC3 → src/app/server/orders/place-order.integration.test.ts
- AC4 → src/app/server/orders/place-order.integration.test.ts
- AC5 → src/app/db/constraints.test.ts
- AC6 → src/app/server/orders/place-order.integration.test.ts

## Notes
- No UI. Complements S-091. Test run against a local test database, never a shared one.
