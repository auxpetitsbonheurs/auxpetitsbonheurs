# S-217: Count account usage without tracking anyone
Status: ready
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
