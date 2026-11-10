# S-084: Seasonal products judged on the pickup/delivery date
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/pricing-availability-promotions.md#decisions-made-in-this-spec-flagged-where-they-differ-from-the-prototype
Estimate: 3 pts
Owner: api-engineer, test-engineer

## Story
As a customer ordering a seasonal cake, I want to be offered only dates inside its season, so that my order is not refused later.

## Acceptance Criteria
- [ ] AC1 (FR-006): Given a seasonal product with window 1-25 Dec, when `productProblem` runs on 25 Dec and 26 Dec (Mauritius), then null and `out_of_season` (T-PRD-2, 3); a window starting 26 Dec is `out_of_season` on 25 Dec and orderable on 26 Dec (T-PRD-4).
- [ ] AC2 (FR-006): Given now 2026-12-25T20:30Z (= 26 Dec Mauritius), when evaluated, then `out_of_season` (T-PRD-8).
- [ ] AC3 (FR-006): Given precedence, then hidden > out_of_season > sold_out; sold out is visible but not orderable (T-PRD-5..7).
- [ ] AC4 (FR-006): Given a basket with an item seasonal until 25 Dec, when `dayStatus` runs with the item's window, then dates after 25 Dec have reason `out_of_season`, 24 Dec is available; with two seasonal items the date must lie inside all windows.
- [ ] AC5 (FR-006): Given the same basket, when `placeOrder` is posted with date 27 Dec, then `DATE_UNAVAILABLE` with reason `out_of_season` and no order; date 24 Dec succeeds.
- [ ] AC6 (FR-006, FR-014): Given the picker tooltip text for out_of_season, when rendered, then "Not available: {item} is only available {start} to {end}" (EN and FR keys exist).
- [ ] AC7 (FR-006): Given a seasonal item that leaves its season while it is in the basket (today passes D), when `/basket` loads, then the line shows an unavailable Alert with Remove (see S-091).

## Tests
- AC1 → src/app/domain/availability.test.ts
- AC2 → src/app/domain/availability.test.ts
- AC3 → src/app/domain/availability.test.ts
- AC4 → src/app/domain/availability.test.ts
- AC5 → src/app/routes/site/basket.place-order.test.ts
- AC6 → src/app/i18n/keys.test.ts
- AC7 → src/app/routes/site/basket.test.tsx

## Notes
- Owner decision Q2 (CHANGED): window judged on the fulfilment date; display on Menu still uses today (E-04 S-064). Fixed clocks only.
- AC5 needs the `placeOrder` pipeline from S-091; test file is shared. Dependency on S-083 (dayStatus windows).
