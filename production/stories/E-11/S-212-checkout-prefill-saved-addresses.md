# S-212: Checkout prefills my details and offers my saved addresses
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#ux
Estimate: 3 pts
Owner: ui-engineer, api-engineer

## Story
As a signed-in customer, I want checkout to know my name, phone, email and addresses, so that I can order in seconds.

## Acceptance Criteria
- [ ] AC1 (FR-021, FR-035): Given a signed-in customer, then checkout prefills name, phone and email; a guest sees empty fields.
- [ ] AC2 (FR-035): Given a saved default address and fulfilment = delivery, then it is preselected in a radio list of saved addresses.
- [ ] AC3 (FR-035): Given I type a new address and tick "Save this address", then it is saved to my account after the order is placed; unticked, nothing is saved.
- [ ] AC4 (FR-035): Given pickup is chosen, then saved addresses are not offered.
- [ ] AC5 (FR-034): Given a signed-in customer, then checkout is never gated and I can edit any prefilled value for this order without changing my profile.
- [ ] AC6 (FR-035, NFR-003): Given a signed-in customer, then order matching uses their own customer row; the typed contact data goes to the order snapshot only and does not overwrite `customer.email`.
- [ ] AC7 (FR-035): Given a customer with no saved addresses, then the delivery address field is shown with the "Save this address" checkbox.
- [ ] AC8 (NFR-002): Given keyboard only, then the radio list is a labelled group operable with arrow keys, the checkbox has a label, and focus stays visible.
- [ ] AC9 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then the checkout stays single column with no horizontal scroll; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`.
- [ ] AC10 (NFR-007): Given EN and FR, then all new strings exist in both.

## Tests
- AC1 → src/app/routes/checkout.prefill.test.tsx
- AC2 → src/app/routes/checkout.prefill.test.tsx
- AC3 → src/app/routes/checkout.prefill.test.ts
- AC4 → src/app/routes/checkout.prefill.test.tsx
- AC5 → src/tests/e2e/account-checkout.spec.ts
- AC6 → src/app/routes/checkout.prefill.integration.test.ts
- AC7 → src/app/routes/checkout.prefill.test.tsx
- AC8 → src/tests/e2e/account-checkout.spec.ts
- AC9 → src/tests/e2e/account-checkout.spec.ts
- AC10 → src/app/routes/checkout.prefill.test.tsx

## Notes
- Modifies the E-05 checkout; FR-021 link only (E-05 owns the base). Customer matching rule: contracts.md "Customer matching".
- Dependencies (R9): S-211, S-210, E-05. Not yet done; expected.

## Build notes (2026-11-13)
- AC6 changed (coordinator decision 2026-11-13): a signed-in customer's order is attached to their own customer row whatever email is typed, and My orders lists it. Migration 0021 adds `orders.by_account` and re-creates `place_order` from the 0013 body with one change: the server passes `order.accountCustomerId` from the customer session (never the form); a linked account row wins over the email match. Guests are unchanged. The typed contact data stays a snapshot on the order; `customer.email` is never overwritten. My orders now lists `customer_id = mine AND (confirmed email OR manual OR by_account)`.
- AC1: the basket loader reads the session only when the `apb_customer` hint is present (guests do no auth work); the basket's client loader asks the server for a signed-in customer so a client navigation is prefilled too.
- AC2/AC3: saved addresses are a radio group with "A new address"; without JavaScript the fields stay visible and the server uses the chosen saved address (checked to be the customer's own). "Save this address" saves after the order is placed (label = first line; the first saved becomes the default); a failure there is logged and never touches the order.
- Tests: src/app/routes/site/checkout-account.test.ts, src/tests/e2e/account-checkout.spec.ts.
