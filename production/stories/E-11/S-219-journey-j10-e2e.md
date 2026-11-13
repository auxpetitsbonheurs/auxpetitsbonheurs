# S-219: Journey J10 works end to end: save details, confirm, sign in, reorder
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#acceptance-criteria
Estimate: 3 pts
Owner: test-engineer

## Story
As the Owner, I want the whole returning-customer journey proven on staging, so that I can trust accounts without testing each piece by hand.

## Acceptance Criteria
- [ ] AC1 (FR-038, FR-036): Given a guest placed 2 orders with email e, when they tap Save my details, confirm the email, choose a password and sign in, then My orders shows both orders.
- [ ] AC2 (FR-037): Given a past order, when Reorder is tapped, then the basket holds the available items at today's prices with the skipped note, and a new date is chosen at checkout.
- [ ] AC3 (FR-034): Given no account, when a guest orders from `/fr/basket`, then the order succeeds and emails are French; no account is required.
- [ ] AC4 (FR-039): Given a customer session, when opening `/admin`, then the visitor is redirected to `/admin/login` and sees no admin data.
- [ ] AC5 (FR-038, NFR-003): Given an unconfirmed Save my details, then My orders is empty and the tracking link still works.
- [ ] AC6 (FR-034, NFR-003): Given 6 failed sign-ins, then the 6th shows the wait message.
- [ ] AC7 (FR-034): Given a signed-in customer on a 375 px viewport, then the journey completes with touch-size targets and no horizontal scroll.

## Tests
- AC1 → src/tests/e2e/j10-account-journey.spec.ts
- AC2 → src/tests/e2e/j10-account-journey.spec.ts
- AC3 → src/tests/e2e/j10-account-journey.spec.ts
- AC4 → src/tests/e2e/j10-account-journey.spec.ts
- AC5 → src/tests/e2e/j10-account-journey.spec.ts
- AC6 → src/tests/e2e/j10-account-journey.spec.ts
- AC7 → src/tests/e2e/j10-account-journey.spec.ts

## Notes
- Email steps use a test inbox helper (no real network in unit tests; e2e uses the staging test inbox or a mail capture).
- If FR-037/FR-038 are cut, remove AC1/AC2/AC5 accordingly (PRD cut order).
- Dependencies (R9): S-206..S-216, E-10 emails. Not yet done; expected.

## Build notes (2026-11-14)
- src/tests/e2e/j10-account-journey.spec.ts on the 375 px phone: AC1, AC2, AC4, AC5, AC6, AC7. AC3 (a guest orders from /fr/basket, no account) is covered by checkout.spec.ts and skeleton-order.spec.ts. Emails come from the GoTrue stub (no real network), so the journey with real emails still waits for Resend on a custom domain (E-10).
