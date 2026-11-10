# S-095: Tracking progress bar, final-state alerts and quote block
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#tracking-page-content
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer, I want to see where my order is in the process and any message from the bakery, so that I know what happens next.

## Acceptance Criteria
- [ ] AC1 (FR-026): Given a delivery order, when it is Pending approval, Approved, In preparation, Out for delivery or Completed, then an ordered list shows the five steps with the current one marked `aria-current="step"`; a pickup order shows Ready for pickup instead of Out for delivery; a quote order starts at Quote needed, Quote sent.
- [ ] AC2 (FR-026): Given status declined, cancelled or closed, when rendered, then an Alert replaces the progress bar, including the decline reason when set; an order cancelled by an admin while a quote was sent shows cancelled with no Accept/Decline.
- [ ] AC3 (FR-026): Given a `quote_sent` order with an unexpired quote, when rendered, then amount, note, expiry date, Accept (primary) and Decline (secondary) show (actions are specified in E-08); with an expired quote an Alert shows and the buttons are removed (`quote.canRespond` false).
- [ ] AC4 (FR-026): Given bakery messages (decline reason, quote note), when rendered, then they show as plain text (escaped) in the order's locale.
- [ ] AC5 (FR-026): Given each status, when rendered in EN and FR, then the customer-wording label exists in both languages (no raw enum shown).
- [ ] AC6 (FR-026, NFR-002, NFR-006): Given the page at 320 px and 375 px, 200% zoom and keyboard-only and a screen reader, when read, then steps are announced "Step 2 of 5: Approved, current", status is conveyed by text and icon not colour alone, Alerts use `role=status` or `alert` appropriately, buttons >= 44 px, contrast AA per `docs/design/tokens.json`.

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
