# S-082: Promotions: live window, best price, no stacking
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/pricing-availability-promotions.md#decisions-made-in-this-spec-flagged-where-they-differ-from-the-prototype
Estimate: 3 pts
Owner: api-engineer, test-engineer

## Story
As the bakery owner, I want promotions to start and end exactly on their Mauritius times and always give the customer the lowest price, so that offers are fair and predictable.

## Acceptance Criteria
- [ ] AC1 (FR-016): Given a promotion 12 Nov 09:00 to 18:00 Mauritius time, when `isLive` runs at 08:59:59.999, 09:00:00.000, 17:59:59.999 and 18:00:00.000, then not live, live, live, not live (end exclusive; T-PM-1).
- [ ] AC2 (FR-016): Given `active=false` inside the window, then not live and status `inactive`; before and after the window the status is `scheduled` and `ended`; a row with `endsAt <= startsAt` is never live (T-PM-2..4).
- [ ] AC3 (FR-016): Given 20% on base 3000, when priced, then sale 2400; given rounding cases 15% of 1250, 15% of 1999, 10% of 995, 33% of 100, 99% of 1, then 1063, 1699, 896, 67, 0 (half up; T-PM-5, 6, 9).
- [ ] AC4 (FR-016): Given a fixed sale price >= base, or percent 0 or 100, when evaluated, then it is not a discount and is ignored (T-PM-8, 16).
- [ ] AC5 (FR-016): Given a discount, when a line is priced, then option deltas and the delivery fee are unchanged and the original price is returned for strike-through (`originalUnitPriceRs`).
- [ ] AC6 (FR-017): Given live promotions 20% (2400) and a sale price 2200, when `bestPromotion` runs, then 2200 and that promotion's id; 20% and 10% give 2400, not 2160 (T-PM-10, 11).
- [ ] AC7 (FR-017): Given equal lowest prices, when tie-broken, then the earlier `startsAt`, then lower id; any permutation of inputs gives the same answer (property test).
- [ ] AC8 (FR-017): Given a promotion that does not cover the product, an ended cheaper one and an inactive cheaper one, when evaluated, then all are ignored (T-PM-13).
- [ ] AC9 (FR-017): Given an order line priced with a promotion, when `priceLine` returns, then `promotionId` is set on the line (recorded on the order in S-092).
- [ ] AC10 (FR-002, FR-004): Given banner-only, card-only, both and none live, when `liveBanner` and `liveCards` run, then banner = latest `startsAt` (card-only excluded), cards ordered `startsAt` desc then id with banner-only excluded (T-PM-14, 15).
- [ ] AC11 (FR-016): Given a promotion whose product is hidden or sold out, when evaluated, then it has no effect (product rules win).

## Tests
- AC1 → src/app/domain/promotions.test.ts
- AC2 → src/app/domain/promotions.test.ts
- AC3 → src/app/domain/promotions.test.ts
- AC4 → src/app/domain/promotions.test.ts
- AC5 → src/app/domain/pricing.test.ts
- AC6 → src/app/domain/promotions.test.ts
- AC7 → src/app/domain/promotions.property.test.ts
- AC8 → src/app/domain/promotions.test.ts
- AC9 → src/app/domain/pricing.test.ts
- AC10 → src/app/domain/promotions.test.ts
- AC11 → src/app/domain/pricing.test.ts

## Notes
- Fixed injected clock in every test (risk: 18:00 boundary). No UI, no a11y ACs.
- Admin editing of promotions is E-03 (FR-063).
- Depends on S-081 for `priceLine` (AC5, AC9); AC1-AC4, AC6-AC8, AC10 are independent.
