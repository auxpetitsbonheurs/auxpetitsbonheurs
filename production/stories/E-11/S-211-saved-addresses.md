# S-211: Save, edit and delete my delivery addresses
Status: ready
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#ux
Estimate: 3 pts
Owner: ui-engineer, api-engineer

## Story
As a signed-in customer, I want to keep my delivery addresses, so that I do not retype them for every order.

## Acceptance Criteria
- [ ] AC1 (FR-035): Given no addresses, then `/account/addresses` shows "No saved addresses yet" and an Add address button.
- [ ] AC2 (FR-035): Given I add an address (label, address, optional landmark, default flag), then it appears in the list with a default marker if chosen.
- [ ] AC3 (FR-035): Given I mark a second address as default, then the first loses its default in the same transaction (at most one default per customer, enforced by the DB partial unique index).
- [ ] AC4 (FR-035): Given I delete an address used on past orders, then those orders still show their own copied address.
- [ ] AC5 (FR-035, NFR-003): Given another customer's address id, when updating or deleting, then `NOT_FOUND` and nothing changes; an anonymous caller is redirected to sign-in.
- [ ] AC6 (FR-035): Given empty label or address, then field errors appear; given two sessions editing, then last write wins and the default stays unique.
- [ ] AC7 (NFR-002): Given keyboard only, then the add/edit drawer opens, traps focus, closes with Escape and returns focus to its trigger; delete asks for confirmation reachable by keyboard; fields have labels and `autocomplete="street-address"`.
- [ ] AC8 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then no horizontal scroll or clipped drawer content; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`.
- [ ] AC9 (NFR-007): Given EN and FR, then all strings exist in both.

## Tests
- AC1 → src/app/routes/account/addresses.test.tsx
- AC2 → src/app/routes/account/addresses.test.ts
- AC3 → src/app/routes/account/addresses.integration.test.ts
- AC4 → src/app/routes/account/addresses.integration.test.ts
- AC5 → src/app/routes/account/addresses.test.ts
- AC6 → src/app/routes/account/addresses.test.ts
- AC7 → src/tests/e2e/account-addresses.spec.ts
- AC8 → src/tests/e2e/account-addresses.spec.ts
- AC9 → src/app/routes/account/addresses.test.tsx

## Notes
- Cut with accounts (cut order #5). Checkout use of addresses is S-212.
- Dependencies (R9): S-207. Not yet done; expected.
