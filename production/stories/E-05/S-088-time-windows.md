# S-088: Choose a time window for delivery or pickup
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#flow-one-page-numbered-h2-sections-design-system-checkout
Estimate: 2 pts
Owner: remix-specialist, ui-engineer

## Story
As a customer, I want to choose a time window that fits my fulfilment type, so that I know when to expect or collect my order.

## Acceptance Criteria
- [x] AC1 (FR-020): Given delivery chosen, when the section renders, then radio rows list `windows.delivery` (defaults Morning 9:00-12:00, Afternoon 12:00-17:00, Evening 17:00-20:00); pickup lists `windows.pickup`; the section shows after fulfilment is chosen.
- [x] AC2 (FR-020): Given the Owner edits windows in Settings, when checkout loads next, then the new delivery and pickup lists show separately.
- [x] AC3 (FR-020): Given no window chosen, when Place order is pressed, then `VALIDATION_FAILED` on `windowId` and focus goes to the error summary.
- [x] AC4 (FR-020): Given a posted `windowId` not in the list for the chosen fulfilment (for example a pickup id sent with delivery, or removed from Settings after render), when posted, then `VALIDATION_FAILED` on `fields.windowId` with the refreshed list shown.
- [x] AC5 (FR-020): Given a window label, when rendered in FR, then the FR label shows (EN fallback if missing) with the times formatted per locale.
- [x] AC6 (FR-020, NFR-002, NFR-006): Given the section at 320 px and 375 px, 200% zoom and keyboard-only, when used, then it is a labelled radio group, rows >= 44 px, selection not colour-only, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1, AC5, AC6 (structure) → src/app/components/checkout/checkout-steps.test.tsx, src/tests/e2e/checkout-dates.spec.ts
- AC2 → src/app/routes/site/basket.test.ts ("checkout dates and windows in the loader")
- AC3, AC4 → src/app/routes/site/basket.test.ts, src/app/server/services/place-order.server.test.ts
- AC6 → src/tests/e2e/checkout-dates.spec.ts, src/tests/e2e/checkout.spec.ts (AC12, AC13)

## Notes
- Settings editor for windows is E-03 (FR-066). Window ids are stable (contract `WindowInput`).
- Built 2026-11-13: a refused window answers with the fresh Settings lists (`windows`) and the page shows them; French times read "9 h", "12 h 30".
