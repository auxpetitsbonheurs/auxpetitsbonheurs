# S-066: Choose options, see the live price and add to basket
Status: review
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#product-page-fr-007-fr-008
Estimate: 5 pts
Owner: remix-specialist, tailwind-shadcn-specialist, api-engineer

## Story
As a customer, I want to pick size, flavour and extras and see the exact price update, then add the cake to my basket, so that I know what I will pay before I order.

## Acceptance Criteria
- [x] AC1 (FR-007): Given option groups of kinds single, multiple, text and quantity, when the page renders, then one picker per group shows with choice names and price deltas ("+Rs 150").
- [x] AC2 (FR-007, FR-011): Given selected options and quantity, when they change, then the displayed price equals `priceLine` for the same input, updates in a polite live region (debounced), and equals the server price on the basket line after Add.
- [x] AC3 (FR-007): Given a required group unselected, when Add to basket is pressed, then nothing is added, focus moves to the first missing group and the message "Choose a size" shows; the button stays enabled.
- [x] AC4 (FR-007, FR-016): Given a live promotion on the product, when the page renders, then the original price is struck, the sale price shown, and "Offer ends {date}" appears; after `ends_at` a reload shows no sale.
- [x] AC5 (FR-007): Given valid options, when Add is pressed with JavaScript, then a toast shows and the top-bar basket count updates (announced politely); without JavaScript the form posts and redirects to `/basket`.
- [x] AC6 (FR-007): Given the same configuration added twice, when added, then the existing line quantity increases (cap 50); a different option or message creates a new line.
- [x] AC7 (FR-007, FR-011): Given the basket already has 10 lines, when Add is submitted for a new configuration, then `BASKET_FULL` shows "Your basket is full"; merging into an existing line still works.
- [x] AC8 (FR-007): Given a forged post with a missing required option, a choice from another group or quantity 0 or 51 or fractional, when posted, then `VALIDATION_FAILED` with `fields` for each issue (all issues, not only the first) and nothing is added; a client price field is ignored.
- [x] AC9 (FR-007, FR-005): Given the product became hidden, sold out or out of season after the page loaded, when Add is submitted, then `PRODUCT_UNAVAILABLE` and the page re-renders in the right state.
- [x] AC10 (FR-007): Given `product.min_quantity` is set to 6 (NULL at launch), when quantity 5 is added, then `VALIDATION_FAILED` with `fields.quantity`; with NULL no minimum applies.
- [x] AC11 (NFR-002, NFR-006): Given the options area at 320 px and 375 px, at 200% zoom and keyboard-only, when pickers, Stepper and Add bar are used, then every field has a visible label, the Stepper +/- buttons have distinct accessible names ("Increase quantity of <product>", "Decrease quantity of <product>"; no copied aria-labels), tap targets >= 44 px, selection is not colour-only, contrast is AA per `docs/design/tokens.json`, and the sticky bar never covers a focused control.

## Tests
- AC1 → src/app/routes/site/product.test.tsx
- AC2 → src/app/routes/site/product.test.tsx (compares with domain `priceLine`) and src/app/routes/site/basket.test.ts
- AC3 → src/tests/e2e/product-options.spec.ts
- AC4 → src/app/routes/site/product.test.ts (fixed clock) and src/app/routes/site/product.test.tsx
- AC5 → src/tests/e2e/product-options.spec.ts (JS on and off)
- AC6 → src/app/routes/site/product-options.test.ts (action, shared addLine) and src/tests/e2e/product-options.spec.ts
- AC7 → src/app/routes/site/product-options.test.ts
- AC8 → src/app/routes/site/product-options.test.ts (action)
- AC9 → src/app/routes/site/product-options.test.ts (action)
- AC10 → src/app/routes/site/product-options.test.ts
- AC11 → src/tests/e2e/product-options.spec.ts (axe, viewports, keyboard)

## Notes
- Depends on S-081 (priceLine, validateSelection) and S-082 (promotions); implement against these, or stub in the same PR. Basket cookie format (`apb_basket`, ids/choices/quantity/message only, never prices, < 4 kB, max 10 lines) is shared with S-085.
- Decision: Add to basket always enabled (design-system decision) rather than disabled when invalid.
- Prototype defects not to be copied: identical stepper labels, copied aria-labels.

## Done notes (2026-11-13, Sprint 4 job 1)
- AC4 done with S-082 (2026-11-13): the loader adds `salePriceRs`, `promotionId`, `promotion { title, endsAt }`; the heading and the live price strike the original and read "Was Rs X, now Rs Y"; "Offer ends {date} at {time}" (Mauritius). Tests: src/app/routes/site/product.test.ts (fixed clock) and product.test.tsx.
- Tests as built: loader/action in `src/app/routes/site/product-options.test.ts` (AC2, AC6-AC10), markup in `src/app/routes/site/product.test.tsx` (AC1, AC2, AC11 names), browser in `src/tests/e2e/product-options.spec.ts` (AC1-AC3, AC5, AC6, AC8, AC11 at 320/375/1280 with axe, 200% zoom, keyboard, tap targets, sticky bar). AC6/AC7 run through the action (the shared `addLine`); the cookie format is unchanged.
- Confirmation stays the inline "Added to your basket" status (ADR-0004), not a separate toast.
- No-JavaScript fix (finishing pass): the lazy ordering area was streamed as a hidden Suspense segment, so without JavaScript the form never showed. The loader now preloads the chunk and `lazy` gets a settled thenable (form inline in the first server render), and `entry.server.tsx` keeps finished Suspense boundaries inline (`progressiveChunkSize: Infinity`). Tests: `src/app/routes/site/product-ssr.test.tsx`, `src/app/entry.server.test.tsx`, and the no-JS e2e cases.
