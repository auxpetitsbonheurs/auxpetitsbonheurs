# S-193: Every email arrives in the customer's language
Status: done (2026-11-13; sending untested live: no sender domain yet)
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#email-catalogue
Estimate: 2 pts
Owner: email-specialist, test-engineer

## Story
As a French-speaking customer, I want every email in French when I ordered from the French site, so that I understand it without translating.

## Acceptance Criteria
- [ ] AC1 (FR-070, NFR-007): Given an order placed from `/fr/basket`, then `order_received`, `order_confirmed` and `thank_you` are in French.
- [ ] AC2 (FR-070, NFR-007): Given an order placed from an EN page by a customer whose profile language is FR, then order emails are in English (the order's `locale` wins) and account emails follow the profile.
- [ ] AC3 (NFR-007): Given a template key, then both an EN and an FR string exist for subject, body and button labels; a parity test fails when a key is missing in either language.
- [ ] AC4 (NFR-007): Given a legacy order with no locale, then the email is rendered in EN.
- [ ] AC5 (NFR-007): Given one FR string is missing at runtime, then EN is used for that string only.
- [ ] AC6 (FR-070): Given all 15 customer templates and both languages, then each renders without a leftover `{placeholder}` or "undefined" for a sample order.

## Tests
- AC1 → src/tests/e2e/notifications-locale.spec.ts
- AC2 → src/app/server/email/locale.test.ts
- AC3 → src/app/server/email/templates/parity.test.ts
- AC4 → src/app/server/email/locale.test.ts
- AC5 → src/app/server/email/locale.test.ts
- AC6 → src/app/server/email/templates/parity.test.ts

## Notes
- Copywriter delivers the EN/FR strings (spec Copy); Owner reviews wording before launch (S-222).
- Dependencies (R9): S-188..S-192, E-05. Not yet done; expected.
