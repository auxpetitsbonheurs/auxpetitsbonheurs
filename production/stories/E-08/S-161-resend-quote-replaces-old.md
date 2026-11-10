# S-161: Re-send a quote that replaces the old one
Status: ready
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#api-contract
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, test-engineer

## Story
As an admin, I want to send a revised quote while the first is still open, so that the customer can only accept the new amount.

## Acceptance Criteria
- [ ] AC1 (FR-033): Given Quote sent, when I send a new quote, then amount, note and expiry are replaced, the event `quote_sent` holds the previous amount, note and expiry, `version` is bumped, and a second "Your quote" email is queued (`dedupe_key` order:<id>:quote:v<version>).
- [ ] AC2 (FR-033): Given the customer's open page holds the old `version`, when they tap Accept, then `ORDER_CHANGED` and "This quote was updated, reload to see the new amount"; the old email's buttons open the tracking page, which shows the current quote.
- [ ] AC3 (FR-033): Given the re-quote, then `total_rs` equals the new amount.
- [ ] AC4 (FR-033): Given the order is Approved, Closed or Declined, when `sendQuote` is called, then `INVALID_TRANSITION`.
- [ ] AC5 (FR-033): Given a re-quote with the same values as the previous quote, then it is still allowed and still creates a new email (admin intent); an invalid expiry or amount returns `VALIDATION_FAILED`.
- [ ] AC6 (FR-033, FR-041): Given a customer or anonymous session, then the re-send is refused; Admin and Owner can re-send.
- [ ] AC7 (NFR-002, NFR-006): Given the Quote sent order detail, then the "Send a new quote" button has a distinct label from "Send quote", opens the same drawer prefilled with the current values, and meets focus, 44 px, AA contrast per `docs/design/tokens.json` and 320/375 px at 200% zoom.

## Tests
- AC1 → src/app/routes/admin.orders.$id.test.tsx
- AC2 → src/app/routes/t.$token.test.tsx
- AC3 → src/app/routes/admin.orders.$id.test.tsx
- AC4 → src/app/domain/order-transitions.test.ts
- AC5 → src/app/routes/admin.orders.$id.test.tsx
- AC6 → src/app/routes/admin.orders.$id.test.tsx
- AC7 → src/tests/e2e/admin-request.a11y.spec.ts

## Notes
- FR-033 is Should and not in the PRD cut order; candidate to defer if needed (confirm with product-director). Depends on S-156, S-158.
