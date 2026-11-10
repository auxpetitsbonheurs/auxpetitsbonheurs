# S-090: Order summary, payment information and policy acceptance
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#flow-one-page-numbered-h2-sections-design-system-checkout
Estimate: 3 pts
Owner: remix-specialist, ui-engineer

## Story
As a customer, I want to see my items, fee, total and how to pay, and accept the policies before sending, so that I order knowing the terms.

## Acceptance Criteria
- [ ] AC1 (FR-022): Given a delivery basket, when the summary renders, then it lists items, a "Delivery fee Rs 200" line, the total (items + fee) and payment information: the Juice number from Settings (a fake placeholder number until deploy day) or cash on delivery/pickup.
- [ ] AC2 (FR-022): Given pickup, when the summary renders, then "Pickup: free" shows and the total equals the items.
- [ ] AC3 (FR-022): Given the policy checkbox unticked, when Place order is pressed, then `VALIDATION_FAILED` on `acceptPolicies`, no order is created and focus goes to the error summary.
- [ ] AC4 (FR-022): Given the policy label link, when opened, then a sheet shows the policies including the 48-hour cancellation text with a link to `/faq#cancellation` and the privacy note; the sheet traps focus and Esc closes it returning focus.
- [ ] AC5 (FR-022): Given the Juice number is empty in Settings, when the summary renders, then only cash information shows (no empty "Juice:" line).
- [ ] AC6 (FR-022): Given the sticky bar, when the keyboard opens on a phone, then the bar hides; while submitting the button is disabled and loading; it reads "Place order at Rs {total}".
- [ ] AC7 (FR-022, NFR-002, NFR-006): Given the summary at 320 px and 375 px, 200% zoom and keyboard-only, when used, then the checkbox has a visible label, the sticky bar never hides a focused field, the total is not clipped, tap targets >= 44 px, contrast AA per `docs/design/tokens.json`.

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
