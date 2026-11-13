# S-093: Order confirmation page
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#screens--states
Estimate: 2 pts
Owner: remix-specialist, tailwind-shadcn-specialist

## Story
As a customer who just sent an order, I want a clear confirmation with my order number and tracking link, so that I know it was received and how to follow it.

## Acceptance Criteria
- [x] AC1 (FR-025): Given an order was sent, when `/order/:token/confirmed` (or `/fr/...`) loads, then it shows the order number (large, copyable), the notice "Not confirmed until we approve it" and the tracking link with Copy and Share.
- [x] AC2 (FR-025): Given a refresh of the confirmation URL, when reloaded, then the same order shows and no new order is created.
- [x] AC3 (FR-025): Given a wrong or unknown token, when requested, then the same not-found state shows with WhatsApp (identical response for both).
- [ ] AC4 (FR-025): Given a guest, when the page renders, then a "Save my details" card shows (action in E-11); given a signed-in customer it does not.
- [x] AC5 (FR-025): Given an order placed from `/fr/basket`, when the confirmation loads, then it defaults to French (`orders.locale = fr`).
- [x] AC6 (FR-025): Given the page, when delivered, then headers include `noindex`, `no-store` and `Referrer-Policy: no-referrer` and the token is redacted in logs.
- [x] AC7 (FR-025, NFR-002, NFR-006): Given the page at 320 px and 375 px, 200% zoom and keyboard-only, when Copy and Share are used, then they have distinct labels ("Copy order number", "Copy tracking link", "Share tracking link"), a polite "Copied" confirmation, targets >= 44 px, the info Alert is not colour-only, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/site/order-confirmed.test.tsx
- AC2 → src/app/routes/site/order-confirmed.test.ts
- AC3 → src/app/routes/site/order-confirmed.test.ts
- AC4 → src/app/routes/site/order-confirmed.test.tsx
- AC5 → src/app/routes/site/order-confirmed.test.ts
- AC6 → src/app/routes/site/order-confirmed.test.ts
- AC7 → src/tests/e2e/checkout-a11y.spec.ts

## Notes
- E-01 builds the minimal confirmation; this story completes content and states. Order number allocation and idempotency are E-01 (FR-023/024).

## Implementation notes (2026-11-13, E-05 finish)
- Delivered by E-01 S-015 (tests: src/app/routes/site/order-confirmed.test.ts, src/tests/e2e/checkout.spec.ts "S-015 order confirmation"); the payment block on this page belongs to Juice payment (S-278).
- AC7: the buttons are now "Copy order number", "Copy tracking link" and "Share tracking link" (EN/FR), each distinct; "Copied" is announced politely.
- AC4 deferred to the accounts work (E-11, parallel: migration 0014 / contract v0.41): the "Save my details" card needs its sign-up action. `offerSaveDetails` stays false until then.
- 2026-11-13 (E-11 S-215): the card is built; `offerSaveDetails` is true for a website order when the browser has no customer session (see S-215 build notes).
