# S-089: Customer details with Mauritius phone formatting
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#phone-normalisation-domainphonets
Estimate: 3 pts
Owner: remix-specialist, api-engineer, ui-engineer

## Story
As a customer, I want to enter my name, phone and email once and type my number the local way, so that the bakery can reach me.

## Acceptance Criteria
- [ ] AC1 (FR-021): Given the details section, when rendered, then name, phone (`type=tel`, `autocomplete=tel`), email (`type=email`, `autocomplete=email`) and an optional note show with visible labels and the right mobile keyboards.
- [ ] AC2 (FR-021): Given phone "5712 3456", "+230 5712 3456", "00 33 6 12 34 56 78" or "23057123456", when placed, then stored as `+23057123456`, `+23057123456`, `+33612345678` and `+23057123456`.
- [ ] AC3 (FR-021): Given phone "12345" or letters, when posted, then `VALIDATION_FAILED` with `fields.contact.phone` and no order.
- [ ] AC4 (FR-021): Given an invalid email, an empty name or a name over 80 characters, or a note over 1000 characters, when posted, then `VALIDATION_FAILED` per field.
- [ ] AC5 (FR-021): Given a signed-in customer (E-11), when checkout loads, then name, phone and email are prefilled; for a guest the fields are empty (loader accepts `prefill` null).
- [ ] AC6 (FR-021): Given typed details and an error elsewhere on the form, when the page re-renders, then typed values are kept.
- [ ] AC7 (NFR-004, FR-021): Given contact data, when logged on errors, then logs contain no name, phone or email.
- [ ] AC8 (FR-021, NFR-002, NFR-006): Given the section at 320 px and 375 px, 200% zoom and keyboard-only, when used, then each field has a visible label (not placeholder-only), error text linked by `aria-describedby`, inputs >= 44 px high, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/site/basket.test.tsx
- AC2 → src/app/domain/phone.test.ts
- AC3 → src/app/domain/phone.test.ts and src/app/routes/site/basket.place-order.test.ts
- AC4 → src/app/routes/site/basket.place-order.test.ts
- AC5 → src/app/routes/site/basket.test.tsx
- AC6 → src/app/routes/site/basket.test.tsx
- AC7 → src/app/server/logging.test.ts
- AC8 → src/tests/e2e/checkout-a11y.spec.ts

## Notes
- E-01 may already contain `domain/phone.ts` for the minimal slice; if so this story widens its tests only.
- Account prefill content is E-11; only the loader seam is here.
