# S-213: See my current and past orders with their status
Status: in-progress
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#ux
Estimate: 3 pts
Owner: ui-engineer, api-engineer

## Story
As a signed-in customer, I want a list of my orders with status, so that I can follow them and find an old order.

## Acceptance Criteria
- [ ] AC1 (FR-036): Given a customer with 3 orders, then My orders lists all three with number, date, window, total and a status chip, split into Current and Past (completed, declined, cancelled, closed are Past).
- [ ] AC2 (FR-036): Given each order, then a Track link opens its tracking page and Reorder is offered on past orders.
- [ ] AC3 (FR-036): Given no orders, then "You have no orders yet" and an Order now button are shown.
- [ ] AC4 (FR-036, NFR-003): Given customer C (email V, phone P) and a guest order with email A and phone P, then a new customer row for A is created, C's email is unchanged, and an account confirmed for A lists only orders with email A.
- [ ] AC5 (FR-036, NFR-003): Given another customer's orders, then they never appear in my list; anonymous callers are redirected to sign-in; an admin session gets no customer data.
- [ ] AC6 (FR-036): Given orders created by admins with `source = manual` linked to my customer row, then they are listed.
- [ ] AC7 (FR-036): Given a loading state, then skeleton cards show; given a load error, then a retry is offered.
- [ ] AC8 (NFR-002): Given keyboard only, then every Track and Reorder action is reachable in order with a distinct accessible name (including the order number); the status is text, not colour alone.
- [ ] AC9 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then cards stack without horizontal scroll; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`.
- [ ] AC10 (NFR-007, NFR-008): Given EN and FR, then labels exist in both; money is "Rs 1,250" / "Rs 1 250" and dates are in Mauritius time.

## Tests
- AC1 → src/app/routes/account/orders.test.tsx
- AC2 → src/app/routes/account/orders.test.tsx
- AC3 → src/app/routes/account/orders.test.tsx
- AC4 → src/app/routes/account/orders.integration.test.ts
- AC5 → src/app/routes/account/orders.integration.test.ts
- AC6 → src/app/routes/account/orders.integration.test.ts
- AC7 → src/app/routes/account/orders.test.tsx
- AC8 → src/tests/e2e/account-orders.spec.ts
- AC9 → src/tests/e2e/account-orders.spec.ts
- AC10 → src/app/routes/account/orders.test.tsx

## Notes
- FR-036 is Should; cut with accounts (cut order #5). Filter rule: `customer_id` = session row AND (`lower(contact_email)` = confirmed auth email OR `source = manual`) (contracts.md, threat-model G-02).
- AC4 maps to spec AC6c.
- Dependencies (R9): S-207, E-05 (orders), E-06 (status chips). Not yet done; expected.

## Build notes (2026-11-13)
- Built: list, Current/Past, Track links, empty state, error state with Retry, G-02 filter (session row AND confirmed email, or manual). Reorder buttons arrive with S-214.
- AC7: server-rendered, so no skeleton; a failed read shows the error with Retry.
- Tests: src/app/routes/account/orders.test.ts, src/tests/e2e/account.spec.ts.
