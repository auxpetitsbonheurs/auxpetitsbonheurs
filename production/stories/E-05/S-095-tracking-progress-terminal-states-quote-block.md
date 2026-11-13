# S-095: Tracking progress bar, final-state alerts and quote block
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#tracking-page-content
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer, I want to see where my order is in the process and any message from the bakery, so that I know what happens next.

## Acceptance Criteria
- [x] AC1 (FR-026): Given a delivery order, when it is Pending approval, Approved, In preparation, Out for delivery or Completed, then an ordered list shows the five steps with the current one marked `aria-current="step"`; a pickup order shows Ready for pickup instead of Out for delivery; a quote order starts at Quote needed, Quote sent.
- [x] AC2 (FR-026): Given status declined, cancelled or closed, when rendered, then an Alert replaces the progress bar, including the decline reason when set; an order cancelled by an admin while a quote was sent shows cancelled with no Accept/Decline.
- [ ] AC3 (FR-026): Given a `quote_sent` order with an unexpired quote, when rendered, then amount, note, expiry date, Accept (primary) and Decline (secondary) show (actions are specified in E-08); with an expired quote an Alert shows and the buttons are removed (`quote.canRespond` false).
- [x] AC4 (FR-026): Given bakery messages (decline reason, quote note), when rendered, then they show as plain text (escaped) in the order's locale.
- [x] AC5 (FR-026): Given each status, when rendered in EN and FR, then the customer-wording label exists in both languages (no raw enum shown).
- [x] AC6 (FR-026, NFR-002, NFR-006): Given the page at 320 px and 375 px, 200% zoom and keyboard-only and a screen reader, when read, then steps are announced "Step 2 of 5: Approved, current", status is conveyed by text and icon not colour alone, Alerts use `role=status` or `alert` appropriately, buttons >= 44 px, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/site/tracking.test.tsx
- AC2 → src/app/routes/site/tracking.test.tsx
- AC3 → src/app/routes/site/tracking.test.tsx
- AC4 → src/app/routes/site/tracking.test.tsx
- AC5 → src/app/i18n/keys.test.ts
- AC6 → src/tests/e2e/tracking.spec.ts

## Notes
- Quote accept/decline behaviour and expiry belong to E-08 (FR-030..033); this story only renders. `progress` comes from the loader (steps and current).
- Depends on S-094.

## Implementation notes (2026-11-13, E-05 finish)
- AC3 deferred to E-08 (custom requests, parallel work on migration 0016 / contract v0.43): Accept and Decline need the `acceptQuote`/`declineQuote` actions, and no order can reach `quote_sent` before E-08 ships the quote flow. Rendering buttons with no action behind them would frustrate customers. The loader's `quote` field is left for E-08 to add with its actions.
- AC1: the quote path (Quote needed, Quote sent, Approved, ...) is in `customerProgress(status, fulfilment, source)`; tracking reads `orders.source`.
- AC2, AC4: `FinalStateAlert` replaces the progress list for declined, cancelled and closed; the decline reason is rendered as escaped plain text. AC4's quote note follows AC3 (E-08).
- AC5: every status now has customer wording in EN and FR (`order.status.*`), so the badge never falls back to a generic label.
