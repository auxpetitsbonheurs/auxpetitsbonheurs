# S-190: Customer gets the quote email and is told when a quote closes
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#email-catalogue
Estimate: 3 pts
Owner: email-specialist

## Story
As a customer who asked for a custom cake, I want an email with the price and clear Accept and Decline buttons, and a message if the quote closes, so that I can answer in time or ask again.

## Acceptance Criteria
- [ ] AC1 (FR-070, FR-071): Given an admin sends or re-sends a quote, then one `quote` email shows amount, note, expiry date ("valid through" that day, Mauritius time) and Accept and Decline buttons that both link to the tracking page.
- [ ] AC2 (FR-070): Given a quote re-sent with a new version, then a new email is sent (dedupe key includes the quote version); given the same version replayed, then no duplicate.
- [ ] AC3 (FR-070): Given the customer declines a quote, then one `quote_closed` email says it was declined and links to send a new request.
- [ ] AC4 (FR-070): Given a quote expires (`expireQuotes`), then one `quote_closed` email says it expired and links to send a new request.
- [ ] AC5 (FR-070): Given the quote has no note, then the note block is omitted and no empty paragraph is shown.
- [ ] AC6 (FR-070): Given a request without an email address, then nothing is sent and no error is raised.

## Tests
- AC1 → src/app/server/email/templates/quote.test.ts
- AC2 → src/app/server/email/outbox.test.ts
- AC3 → src/app/server/email/templates/quote-closed.test.ts
- AC4 → src/app/server/email/templates/quote-closed.test.ts
- AC5 → src/app/server/email/templates/quote.test.ts
- AC6 → src/app/server/email/templates/quote.test.ts

## Notes
- Custom requests require an email in the form (E-08); AC6 is defensive for legacy data.
- Quote expiry job and status logic are E-08; this story provides templates and the email hook. The admin push on expiry is S-199.
- Dependencies (R9): S-186, S-188, E-08. Not yet done; expected.
