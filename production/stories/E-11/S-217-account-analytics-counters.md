# S-217: Count account usage without tracking anyone
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#analytics-events
Estimate: 2 pts
Owner: api-engineer, privacy-compliance-specialist

## Story
As the Owner, I want simple counts of sign-ups, sign-ins and reorders, so that I can see whether accounts are used without any cookies or personal data.

## Acceptance Criteria
- [ ] AC1 (NFR-011): Given a confirmed account, a sign-in, Save my details shown/completed, a reorder started and an address saved, then each records one server-side counter with only the listed properties (method, linkedOrders, skippedCount, atCheckout).
- [ ] AC2 (NFR-004, NFR-011): Given any counter record, then it contains no email, name, phone, address, order number, IP or user id.
- [ ] AC3 (NFR-011): Given the pages involved, then no tracking cookie is set and no third-party script is loaded.
- [ ] AC4 (NFR-011): Given a counter write fails, then the user action still succeeds and the failure is logged without PII.
- [ ] AC5 (NFR-011): Given a failed sign-in, then no `sign_in` counter is recorded.

## Tests
- AC1 → src/app/server/analytics/account-events.test.ts
- AC2 → src/app/server/analytics/account-events.test.ts
- AC3 → src/tests/e2e/account-no-cookies.spec.ts
- AC4 → src/app/server/analytics/account-events.test.ts
- AC5 → src/app/server/analytics/account-events.test.ts

## Notes
- Small cross-cutting story; counters stored with the existing analytics mechanism from E-01/E-09 (assumed; adapt to whatever exists). No UI.
- Dependencies (R9): S-206, S-207, S-214, S-215. Not yet done; expected.

## Build notes (2026-11-13)
- Counter store: table `usage_counter` (day, event, props, count; migration 0017), written after the response; no PII, no cookie. `account_created` and `sign_in` are counted; the other events arrive with their stories.
- All counters now exist except `save_details_shown` (see S-215 notes: counting it would add a database write to the confirmation page's no-database path): `account_created` (signup, link, save_details + linkedOrders), `sign_in` (password, magic_link), `save_details_completed`, `reorder_started` (skippedCount), `address_saved` (atCheckout).
- AC1, AC2, AC4, AC5 tested in src/app/server/usage.server.test.ts. AC3 (no tracking cookie, no third-party script) is checked in the S-218 sweep (src/tests/e2e/account.spec.ts).

## Build notes (2026-11-14)
- AC3 checked in src/tests/e2e/account-a11y.spec.ts: only first-party cookies, no request to another origin on the account pages.
