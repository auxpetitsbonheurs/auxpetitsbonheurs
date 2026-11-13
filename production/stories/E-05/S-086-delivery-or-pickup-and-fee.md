# S-086: Choose pickup or delivery, with the delivery fee
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#flow-one-page-numbered-h2-sections-design-system-checkout
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, ui-engineer

## Story
As a customer, I want to choose between collecting my order and having it delivered, and see the fee and address, so that I know the cost and where it goes.

## Acceptance Criteria
- [x] AC1 (FR-019): Given checkout, when it loads, then Delivery and Pickup are required radio cards with no default selected.
- [x] AC2 (FR-019): Given pickup, when chosen, then the public pickup address (Beau Bassin at launch, from Settings) and map link show and the fee is Rs 0.
- [x] AC3 (FR-019): Given delivery, when chosen, then "Delivery fee Rs 200" (Settings; launch value Rs 200) is added to the total, an address textarea (min 5 characters) and an optional landmark show.
- [x] AC4 (FR-019): Given delivery with an address under 5 characters or empty, when Place order is pressed, then `VALIDATION_FAILED` on `address`, focus moves to the error summary, and no order is created.
- [x] AC5 (FR-019): Given delivery switched to pickup, when switched, then the fee is removed, the address is ignored and not stored, the date is kept and the window resets if its id is not in the pickup list.
- [x] AC6 (FR-019): Given a delivery order is placed, then the stored order has address, landmark and `delivery_fee_rs` equal to the Settings fee at placement; a later Settings change does not alter it.
- [x] AC7 (FR-019): Given neither option chosen, when Place order is pressed, then `VALIDATION_FAILED` on `fulfilment`.
- [x] AC8 (FR-019, NFR-002, NFR-006): Given the section at 320 px and 375 px, 200% zoom and keyboard-only, when used, then radio cards are a labelled radio group operable with arrow keys, >= 44 px, the textarea has a visible label and `autocomplete`, errors are linked via `aria-describedby`, contrast is AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/site/basket.test.tsx
- AC2 → src/app/routes/site/basket.test.tsx
- AC3 → src/app/routes/site/basket.test.tsx
- AC4 → src/app/routes/site/basket.place-order.test.ts
- AC5 → src/app/routes/site/basket.test.tsx
- AC6 → src/app/routes/site/basket.place-order.test.ts
- AC7 → src/app/routes/site/basket.place-order.test.ts
- AC8 → src/tests/e2e/checkout-a11y.spec.ts

## Notes
- Decision from spec: no default selection (avoids a surprise fee); confirm with ux-lead at design review.
- Saved addresses for signed-in customers arrive with E-11 (prefill hook left in the loader).
- Delivery address "too far" is for the admin to decline on review (E-06); no distance check here.

## Implementation notes (2026-11-13, E-05 finish)
- Delivered by E-01 S-012/S-013; verified against the ACs. Tests: src/tests/e2e/checkout.spec.ts (S-012 AC5-AC8), src/app/server/services/place-order.server.test.ts (validation, fee snapshot "the fee is the Settings value at placement, and 0 for pickup with no address kept"), plus a 4-character address case added here.
- AC5: each fulfilment has its own window list and field (`windowId.delivery` / `windowId.pickup`); the server reads only the chosen one, so switching never carries a window that is not in the pickup list. The date is kept.
