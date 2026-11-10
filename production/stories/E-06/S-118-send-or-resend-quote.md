# S-118: Send a quote for a custom request (admin side)
Status: ready
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#api-contract
Estimate: 3 pts
Owner: remix-specialist, api-engineer, ui-engineer

## Story
As an admin, I want to send a price quote with a note and an expiry date for a custom request, so that the customer can accept it.

## Acceptance Criteria
- [ ] AC1 (FR-052): Given quote_needed, when Send quote with Rs 8,500, a note and an expiry 5 days ahead is submitted, then status is quote_sent, `total_rs` = 8,500, a `quote_sent` event stores the admin, and a "Your quote" email is queued.
- [ ] AC2 (FR-052): Given an expiry today or in the past (Mauritius date), or an amount below Rs 1 or above Rs 1,000,000, or a note over 1000 characters, when submitted, then `VALIDATION_FAILED` with field errors and no change.
- [ ] AC3 (FR-052): Given quote_sent, when a re-quote is sent, then the quote is overwritten and the event stores old and new values; the email is sent again.
- [ ] AC4 (FR-052): Given the sheet opens, when rendered, then the expiry defaults to today + `quote_validity_days` from Settings.
- [ ] AC5 (FR-052): Given any status other than quote_needed or quote_sent, when posted, then `INVALID_TRANSITION`.
- [ ] AC6 (FR-052, FR-054): Given a stale `version`, when posted, then `ORDER_CHANGED`.
- [ ] AC7 (FR-052): Given a customer or anonymous session, when posted, then no change.
- [ ] AC8 (NFR-002, NFR-006): Given the Send quote sheet at 375x667, 320 px, 200% zoom and keyboard-only, when used, then amount, note and expiry have visible labels with errors linked, the sheet traps focus and closes on Esc, the submit button is in the bottom half and >= 44 px, "Quote sent to {name}" is announced, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/order.quote.test.ts
- AC2 → src/app/routes/admin/order.quote.test.ts
- AC3 → src/app/routes/admin/order.quote.test.ts
- AC4 → src/app/routes/admin/order.quote.test.ts
- AC5 → src/app/routes/admin/order.quote.test.ts
- AC6 → src/app/routes/admin/order.quote.test.ts
- AC7 → src/app/routes/admin/order.quote.test.ts
- AC8 → src/tests/e2e/admin-order-detail.spec.ts

## Notes
- Scope split: this is only the admin action (FR-052 Send quote). Customer accept/decline, expiry job and quote emails are E-08/E-10. Until E-08 lands, quote_needed orders are created from fixtures.
- Depends on S-115.
