# S-156: Admin sends a quote
Status: ready
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#api-contract
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As an admin, I want to send a priced quote with a note and an expiry date, so that the customer knows the price and how long it stands.

## Acceptance Criteria
- [ ] AC1 (FR-030): Given Quote needed, when I send Rs 4,500 with the default expiry on 2026-11-10 (validity 5 days), then status is Quote sent, `quote_expires_on` is 2026-11-15, `total_rs` is 4500, event `quote_sent` names me, and "Your quote" is queued with amount, note, expiry and Accept/Decline links to the tracking page.
- [ ] AC2 (FR-030): Given `quote_validity_days` = 3 in Settings, then the sheet prefills expiry as today + 3 (from loader `quoteDefaults.expiresOn`).
- [ ] AC3 (FR-030): Given an expiry in the past, an amount of 0 or over Rs 1,000,000, or a note over 1000 characters, when I send, then `VALIDATION_FAILED` with inline errors and nothing changes.
- [ ] AC4 (FR-030): Given an expiry later than the event date, then the sheet allows it with a warning.
- [ ] AC5 (FR-030): Given the order is Approved, Declined or Cancelled, when `sendQuote` is called, then `INVALID_TRANSITION` and no email.
- [ ] AC6 (FR-030, FR-054): Given a stale `version`, then `ORDER_CHANGED` shows an Alert with Reload; given the customer cancelled just before, then `INVALID_TRANSITION`.
- [ ] AC7 (FR-030, FR-041): Given an Admin or Owner session, then I can send; given a customer or anonymous session, then it is refused.
- [ ] AC8 (FR-030): Given send succeeds, then the toast "Quote sent" shows and the chip changes to Quote sent; given the email provider is down, then the quote is still saved and retries from the outbox, and after 6 failures an `email_failed` event shows so I can share the link on WhatsApp.
- [ ] AC9 (NFR-002, NFR-006): Given the send-quote drawer, then it traps and restores focus, the amount, note and expiry fields are labelled with hints, errors are linked with `aria-describedby`, the submit shows a text state while loading, targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and it fits 320/375 px at 200% zoom.
- [ ] AC10 (NFR-008): Given the expiry date, then it is a Mauritius calendar date and displays as "Valid until {date}" in the customer's language.

## Tests
- AC1 → src/app/routes/admin.orders.$id.test.tsx
- AC2 → src/app/routes/admin.orders.$id.test.tsx
- AC3 → src/app/routes/admin.orders.$id.test.tsx
- AC4 → src/app/routes/admin.orders.$id.test.tsx
- AC5 → src/app/domain/order-transitions.test.ts
- AC6 → src/app/routes/admin.orders.$id.test.tsx
- AC7 → src/app/routes/admin.orders.$id.test.tsx
- AC8 → src/app/routes/admin.orders.$id.test.tsx
- AC9 → src/tests/e2e/admin-request.a11y.spec.ts
- AC10 → src/app/domain/dates.test.ts

## Notes
- Depends on S-155, E-06 (transitions per Appendix B, `version`), E-10 (quote email content; outbox stub until then).
- Admin cancelling a sent quote (owner decision 6) is an E-06 order action; E-08 only requires that Accept/Decline then return `INVALID_TRANSITION` (see S-158 AC5).
