# S-081: Pricing rules: server-calculated line and basket totals
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/pricing-availability-promotions.md#module-api-srcappdomain-all-exports-typed-no-any
Estimate: 5 pts
Owner: api-engineer, test-engineer

## Story
As the bakery owner, I want every price calculated by the server from the catalogue, so that a customer can never pay a wrong or tampered price.

## Acceptance Criteria
- [ ] AC1 (FR-011): Given product P (base 3000; Size M +500, Flavour chocolate +200), when `priceLine` runs for qty 1 and qty 2, then unit 3700 and totals 3700 and 7400 (T-PR-1, T-PR-2).
- [ ] AC2 (FR-011): Given option kinds single, multiple, text and quantity, when priced, then single/multiple add deltas, text adds nothing, quantity adds `unitDelta x quantity` (T-PR-3, 4, 5).
- [ ] AC3 (FR-011): Given a negative delta, when the line total stays >= 0 it is allowed (T-PR-7); when it would go negative then `LINE_NEGATIVE`; total 0 is allowed (T-PR-8, T-PR-9).
- [ ] AC4 (FR-011): Given quantity 0, 51, 1.5 or "2" (string), when validated, then a `quantity` issue for each; quantity 50 is ok (T-PR-10, 11).
- [ ] AC5 (FR-011): Given a missing required group, two choices in a single group, an unknown or foreign choice id, a duplicate choice, quantity pick 13 or -1, or a required empty text, when validated, then all issues are listed, not only the first (T-PR-12..17, 21).
- [ ] AC6 (FR-011): Given items 3700 + 7400, when `priceBasket` runs for pickup and delivery with fee Rs 200, then totals are 11100 (fee 0) and 11300; fee setting 0 gives total = items; empty basket gives 0 (T-BK-1..4).
- [ ] AC7 (FR-011): Given a sold-out, hidden or out-of-season line plus a valid line, when priced, then the problem line has `problem` set and is excluded from totals (T-BK-5, 6).
- [ ] AC8 (FR-011): Given a tampered `displayedTotalRs` (one rupee lower, or 1), when `reconcileTotal` runs, then it fails with `PRICE_CHANGED` and the server basket; equal total is ok (T-BK-7, 8).
- [ ] AC9 (FR-011): Given a non-integer, NaN or > 1,000,000 base or delta, when priced, then `INVALID_MONEY` (T-PR-24); `LineInput` has no price field (compile-time check via `expectTypeOf`).
- [ ] AC10 (FR-011): Given `fromPriceRs`, when computed for required Size S +200, then 3200, and with a sale of 2400 it is 2600 (T-PR-22, 23).
- [ ] AC11 (FR-011): Given property tests, when run with fast-check, then `total == sum(lineTotal) + fee` for any basket.
- [ ] AC12 (FR-011, NFR-008): Given money output, when formatted, then whole rupees "Rs 1,250" in EN and FR via the E-01 formatter; `domain/*` imports no db, react, router or network and no test reads the system clock.

## Tests
- AC1 → src/app/domain/pricing.test.ts
- AC2 → src/app/domain/pricing.test.ts
- AC3 → src/app/domain/pricing.test.ts
- AC4 → src/app/domain/pricing.test.ts
- AC5 → src/app/domain/pricing.test.ts
- AC6 → src/app/domain/pricing.test.ts
- AC7 → src/app/domain/pricing.test.ts
- AC8 → src/app/domain/pricing.test.ts
- AC9 → src/app/domain/pricing.test.ts
- AC10 → src/app/domain/pricing.test.ts
- AC11 → src/app/domain/pricing.property.test.ts
- AC12 → src/app/domain/pricing.test.ts and src/app/domain/boundaries.test.ts (import lint)

## Notes
- Re-implemented test-first from the table in the spec; the prototype `prototypes/apb-v1/src/domain` is reference only, never imported.
- Bundle cost of pricing + promotions + time <= 6 kB gz (spec NFR).
- Pure domain: no UI, so no a11y ACs. Includes `graphemeLength` and `time.ts` basics (T-TM-*) needed by pricing; the full availability rules are S-083.
- Depends on E-01 (formatting, tests setup).
