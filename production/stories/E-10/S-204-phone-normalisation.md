# S-204: Phone numbers are stored as Mauritius-friendly E.164
Status: done
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#phone-normalisation-domainphonets-used-by-checkout-custom-form-manual-order-profile
Estimate: 2 pts
Owner: api-engineer

## Story
As a customer or admin typing a phone number the way people write it in Mauritius, I want it understood and stored correctly, so that WhatsApp links and contact always work.

## Acceptance Criteria
- [ ] AC1 (FR-021): Given "5712 3456", then the stored value is +23057123456.
- [ ] AC2 (FR-021): Given "+44 7700 900123" and "0033 6 12 34 56 78", then they are kept as E.164 (+447700900123, +33612345678).
- [ ] AC3 (FR-021): Given "23057123456", then it becomes +23057123456; given "+230 5712 3456", the same.
- [ ] AC4 (FR-021): Given "123", letters, or more than 15 digits, then `VALIDATION_FAILED` with the field message "Enter a phone number, e.g. 5712 3456" (FR equivalent exists).
- [ ] AC5 (FR-021): Given spaces, dashes, dots and parentheses in input, then they are stripped before parsing.
- [ ] AC6 (FR-073): Given a normalised number, then the WhatsApp digits are the E.164 value without "+".
- [ ] AC7 (FR-021): Given empty input where phone is optional, then no error and null is stored.

## Tests
- AC1 → src/app/domain/phone.test.ts
- AC2 → src/app/domain/phone.test.ts
- AC3 → src/app/domain/phone.test.ts
- AC4 → src/app/domain/phone.test.ts
- AC5 → src/app/domain/phone.test.ts
- AC6 → src/app/domain/phone.test.ts
- AC7 → src/app/domain/phone.test.ts

## Notes
- FR-021 belongs to E-05 (checkout), which may already create `domain/phone.ts`. Coordinate with the E-05 storyteller: if it exists this story reduces to the table-driven tests only (spec: "Unit tests table-drive these"). Decision: kept here so the spec's AC32-AC35 have an owner; remove if duplicated.
- Dependencies (R9): E-01 (zod/i18n). Not yet done; expected.

## Implementation notes
- `domain/phone.ts` already existed (E-05); this story added the table-driven tests for AC1-AC7 and `whatsappDigits`. AC4 note: the field message is the existing checkout wording "Enter a phone number, for example 5712 3456." (EN/FR). 7-digit landlines stay accepted (+230 + 7 digits), as the E-05 tests require.
