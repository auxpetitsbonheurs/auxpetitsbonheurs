# S-085: Basket lines: review, change quantity, remove
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#flow-one-page-numbered-h2-sections-design-system-checkout
Estimate: 5 pts
Owner: remix-specialist, tailwind-shadcn-specialist, ui-engineer

## Story
As a customer, I want to see my basket, change quantities or remove items, so that I order exactly what I want.

## Acceptance Criteria
- [ ] AC1 (FR-018): Given 2 lines in the basket cookie, when `/basket` (or `/fr/basket`) loads, then both show photo (56 px), name, chosen options, message on cake, compact Stepper (1-50), line price (struck original when promoted) and Remove, with the subtotal, all priced by the server.
- [ ] AC2 (FR-018): Given a line, when the quantity is changed or Remove is pressed (with or without JS), then totals update and the top-bar basket count updates (announced politely).
- [ ] AC3 (FR-018): Given an empty basket, when `/basket` loads, then "Your basket is empty." with "See the menu" shows and no checkout form.
- [ ] AC4 (FR-018): Given a quantity of 0, 51 or non-numeric posted to `updateLine`, or a line id that does not exist, when posted, then `VALIDATION_FAILED` (or ignored for an unknown line) and the basket is unchanged; `minQuantity` is enforced when set.
- [ ] AC5 (FR-018): Given a tampered or unparseable `apb_basket` cookie, when `/basket` loads, then invalid lines are dropped and the rest kept; unparseable = empty basket; prices in the cookie are never read.
- [ ] AC6 (FR-018): Given a line whose product became sold out, hidden or out of season, when `/basket` loads, then the line shows an Alert and Remove, excluded from the subtotal.
- [ ] AC7 (FR-018): Given 10 lines, when an 11th distinct configuration is added (from the product page), then `BASKET_FULL`; the cookie stays < 4 kB.
- [ ] AC8 (FR-018, NFR-002, NFR-006): Given the basket at 320 px and 375 px, at 200% zoom and keyboard-only, when the Stepper and Remove are used, then the buttons have distinct accessible names ("Increase quantity of <product>", "Decrease quantity of <product>", "Remove <product> (<options>)"; no copied aria-labels), tap targets >= 44 px, the quantity is a labelled input or announced value, line totals are announced politely, contrast is AA per `docs/design/tokens.json`, no sideways scroll.
- [ ] AC9 (FR-018, NFR-001): Given `/basket`, when measured, then it is server-rendered (works without JS), price skeleton only after 300 ms, route JS <= 170 kB gz, CLS <= 0.1.

## Tests
- AC1 → src/app/routes/site/basket.test.tsx
- AC2 → src/tests/e2e/checkout.spec.ts
- AC3 → src/app/routes/site/basket.test.tsx
- AC4 → src/app/routes/site/basket.test.ts
- AC5 → src/app/server/basket-cookie.test.ts
- AC6 → src/app/routes/site/basket.test.tsx
- AC7 → src/app/server/basket-cookie.test.ts
- AC8 → src/tests/e2e/checkout-a11y.spec.ts
- AC9 → src/tests/e2e/perf-budgets.spec.ts

## Notes
- Prototype defects not to copy: same aria-label on every +/- button.
- Cookie `apb_basket` shared with S-066. Depends on S-081 and S-082 for pricing.
- Basket in the one-page checkout: sections are the same route; later stories add sections 2-6.
