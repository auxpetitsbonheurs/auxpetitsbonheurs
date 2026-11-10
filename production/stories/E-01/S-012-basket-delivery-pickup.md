# S-012: Review the basket and choose delivery or pickup
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/specs/features/checkout-and-tracking.md#flow-one-page-numbered-h2-sections-design-system-checkout
Estimate: 3 pts
Owner: ui-engineer, tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer, I want to see my basket, change quantities and choose delivery or pickup with the price shown, so that I know exactly what I will pay.

## Acceptance Criteria
- [ ] AC1 (FR-018): Given a basket with one line, when `/basket` loads, then I see the product name, quantity, line price, subtotal and a numbered "Basket" section; given an empty basket, then "Your basket is empty." and a "See the menu" link show and no form.
- [ ] AC2 (FR-018, NFR-002): Given a line, then the quantity control's buttons are named "Decrease quantity of Chocolate cake" and "Increase quantity of Chocolate cake", and Remove is named "Remove Chocolate cake from basket"; with two lines, no two controls share an accessible name; the current quantity is a labelled field or announced in a polite live region when it changes.
- [ ] AC3 (FR-018): Given quantity 1, then Decrease is disabled and explained; given 50, then Increase is disabled; a posted quantity of 0 or 51 is rejected with `VALIDATION_FAILED`.
- [ ] AC4 (FR-018): Given I change a quantity or press Remove, then totals and the header count update and the change survives a reload.
- [ ] AC5 (FR-019): Given the delivery or pickup choice, then it is two required radio cards with no default; choosing Delivery shows an address textarea (minimum 5 characters), an optional landmark and "Delivery fee Rs 200" (from Settings); choosing Pickup shows the pickup address from Settings (Beau Bassin) and "Pickup: free".
- [ ] AC6 (FR-019): Given I switch from Delivery to Pickup, then the fee is removed from the total and the typed address is ignored.
- [ ] AC7 (NFR-002): Given the basket page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC8 (NFR-002): Given the radio cards and textarea, then every field has a visible label tied to it (not placeholder-only), and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.
- [ ] AC9 (FR-018): Given JavaScript is off, then the basket page still shows lines, quantity changes work through form posts and totals are correct.

## Tests
- AC1 → src/app/routes/site/basket.test.ts
- AC2 → src/tests/e2e/checkout.spec.ts
- AC3 → src/app/routes/site/basket.test.ts
- AC4 → src/app/routes/site/basket.test.ts
- AC5 → src/tests/e2e/checkout.spec.ts
- AC6 → src/app/domain/pricing.test.ts (delivery fee rule)
- AC7 → src/tests/e2e/checkout.spec.ts
- AC8 → src/tests/e2e/checkout.spec.ts
- AC9 → src/tests/e2e/checkout.spec.ts (JavaScript disabled)

## Notes
- Depends on: S-011.
- Prototype defects not carried over: stepper buttons with identical or copied `aria-label`s (AC2).
- "See the menu" links to `/` until the menu page exists in E-04 (decision).
- Pricing here is items + fee only (`domain/pricing.ts` minimal); promotions, options and notice rules arrive in E-05.
- Contract: `site/basket` loader and `updateLine` / `removeLine`.
