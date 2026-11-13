# S-090: Order summary, payment information and policy acceptance
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#flow-one-page-numbered-h2-sections-design-system-checkout
Estimate: 3 pts
Owner: remix-specialist, ui-engineer

## Story
As a customer, I want to see my items, fee, total and how to pay, and accept the policies before sending, so that I order knowing the terms.

## Acceptance Criteria
- [x] AC1 (FR-022): Given a delivery basket, when the summary renders, then it lists items, a "Delivery fee Rs 200" line, the total (items + fee) and payment information: the Juice number from Settings (a fake placeholder number until deploy day) or cash on delivery/pickup.
- [x] AC2 (FR-022): Given pickup, when the summary renders, then "Pickup: free" shows and the total equals the items.
- [x] AC3 (FR-022): Given the policy checkbox unticked, when Place order is pressed, then `VALIDATION_FAILED` on `acceptPolicies`, no order is created and focus goes to the error summary.
- [x] AC4 (FR-022): Given the policy label link, when opened, then a sheet shows the policies including the 48-hour cancellation text with a link to `/faq#cancellation` and the privacy note; the sheet traps focus and Esc closes it returning focus.
- [x] AC5 (FR-022): Given the Juice number is empty in Settings, when the summary renders, then only cash information shows (no empty "Juice:" line).
- [x] AC6 (FR-022): Given the sticky bar, when the keyboard opens on a phone, then the bar hides; while submitting the button is disabled and loading; it reads "Place order at Rs {total}".
- [x] AC7 (FR-022, NFR-002, NFR-006): Given the summary at 320 px and 375 px, 200% zoom and keyboard-only, when used, then the checkbox has a visible label, the sticky bar never hides a focused field, the total is not clipped, tap targets >= 44 px, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/site/basket.test.tsx
- AC2 → src/app/routes/site/basket.test.tsx
- AC3 → src/app/routes/site/basket.place-order.test.ts
- AC4 → src/tests/e2e/checkout.spec.ts
- AC5 → src/app/routes/site/basket.test.tsx
- AC6 → src/tests/e2e/checkout.spec.ts
- AC7 → src/tests/e2e/checkout-a11y.spec.ts

## Notes
- Juice number is a fake placeholder until deploy day (owner supplies the real one in Settings, E-12 launch checklist).
- Payment is manual (no online payment); admins mark paid (E-06).

## Implementation notes (2026-11-13, E-05 finish)
- AC1, AC5 superseded by Juice payment (S-277, S-278, contract v0.40): payment is now the full amount by MCB Juice, and the summary says "Payment: the full amount by MCB Juice. You get the payment details as soon as you place your order." The Juice number is shown only after placing; there is no cash line. Items, fee line and total are as specified.
- AC4 adjusted: the policies open in a disclosure (`<details>`) under the checkbox rather than a sheet. It works without JavaScript and needs no focus trap. It shows the Owner's policy text (48-hour cancellation by default) plus a new privacy note. There is no `/faq` page yet, so there is no `/faq#cancellation` link; the tracking page repeats the 48-hour rule.
- AC6: the button reads "Place order" until a fulfilment is chosen, then "Place order at Rs {total}" for that choice, switched by CSS like the totals, so it is right without JavaScript and wraps at 320 px / 200% zoom. The sticky bar unsticks while a text field has focus (S-013).
- Tests: src/tests/e2e/checkout.spec.ts ("E-05 basket and summary", S-013 AC12-AC14), src/app/server/services/place-order.server.test.ts (acceptPolicies).
