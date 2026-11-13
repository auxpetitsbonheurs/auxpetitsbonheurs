# S-214: Reorder a past order at today's prices
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#edge-cases
Estimate: 5 pts
Owner: api-engineer, ui-engineer

## Story
As a returning customer, I want to put a past order's items back in my basket at today's prices, so that I can repeat a favourite order quickly.

## Acceptance Criteria
- [ ] AC1 (FR-037): Given a past order with one sold-out item and two available items whose prices changed, when I tap Reorder, then the basket has the two items with the same options at today's prices and a note names the skipped item ("Skipped: Vanilla cake (sold out)").
- [ ] AC2 (FR-037): Given an item that was on promotion at purchase and the promotion has ended, then the reorder price is the full price.
- [ ] AC3 (FR-037): Given a past order with a deleted option choice, a hidden or out-of-season product, then that line is skipped with the matching reason (`option_removed`, `hidden`, `out_of_season`).
- [ ] AC4 (FR-037): Given all items are unavailable, then the basket stays as it was, the note says nothing could be added, and the bakery WhatsApp link is offered.
- [ ] AC5 (FR-037): Given a product deleted (`product_id` NULL) or a manual free-text line, then it is skipped with reason `free_text`.
- [ ] AC6 (FR-037, FR-011): Given an order with more lines than the basket allows (10), then the basket stops at 10 and the rest are listed as skipped (`basket_full`); no `BASKET_FULL` crash.
- [ ] AC7 (FR-037, NFR-003): Given another customer's order id, then `NOT_FOUND`; an anonymous caller is redirected to sign-in.
- [ ] AC8 (FR-037): Given a successful reorder, then I am redirected to `/basket` and then choose a new date at checkout (the old date is never reused).
- [ ] AC9 (FR-037, NFR-002): Given the result note, then it is announced via the basket live region; Reorder buttons have a distinct accessible name; keyboard operable with visible focus.
- [ ] AC10 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then the skipped-items note and basket have no horizontal scroll; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`; the note is not conveyed by colour alone.
- [ ] AC11 (NFR-007): Given EN and FR, then names and reasons show in the page language.

## Tests
- AC1 → src/app/routes/account/reorder.test.ts
- AC2 → src/app/routes/account/reorder.test.ts
- AC3 → src/app/routes/account/reorder.test.ts
- AC4 → src/app/routes/account/reorder.test.ts
- AC5 → src/app/routes/account/reorder.test.ts
- AC6 → src/app/routes/account/reorder.test.ts
- AC7 → src/app/routes/account/reorder.test.ts
- AC8 → src/tests/e2e/account-reorder.spec.ts
- AC9 → src/tests/e2e/account-reorder.spec.ts
- AC10 → src/tests/e2e/account-reorder.spec.ts
- AC11 → src/app/routes/account/reorder.test.tsx

## Notes
- PRD cut order #3 (cut after CSV export and Customers list). If cut, drop the Reorder buttons only; My orders (S-213) stays. Thank-you email link "order again" (S-192) must then link to the menu.
- Uses the E-05 pricing engine for current prices; skipped-reason enum per contracts.md.
- Dependencies (R9): S-213, E-05 (pricing, basket `reorderSkipped`), E-03/E-04 (catalogue). Not yet done; expected.

## Build notes (2026-11-13)
- The basket always prices from today's menu, so reorder only rebuilds the lines (same options and message) and checks each against today's menu with the checkout's own pricing; an ended promotion simply gives the full price (AC2).
- Skipped reasons per contracts: `sold_out`, `hidden`, `out_of_season`, `option_removed` (pricing's `options_changed`), `free_text` (deleted product or manual line), `basket_full` (lines past 10; never a BASKET_FULL error).
- The note travels in a one-minute HttpOnly flash cookie (names and reason codes only), shown once in the basket's status region and cleared by that response. Reorder is a plain form post so the browser basket reads the new cookie. Nothing orderable leaves the basket untouched and offers WhatsApp (AC4).
- Tests: src/app/domain/reorder.test.ts, src/app/routes/account/reorder.test.ts, src/tests/e2e/account.spec.ts.
