# S-212: Checkout prefills my details and offers my saved addresses
Status: ready
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
