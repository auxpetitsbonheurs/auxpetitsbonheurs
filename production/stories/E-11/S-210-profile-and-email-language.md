# S-210: Keep my profile and email language up to date
Status: ready
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#ux
Estimate: 3 pts
Owner: ui-engineer, api-engineer

## Story
As a signed-in customer, I want to see and edit my name, phone and email language, so that the bakery reaches me correctly and in my language.

## Acceptance Criteria
- [ ] AC1 (FR-035): Given a signed-in customer, when I save a profile with phone "5712 3456", then +23057123456 is stored and a "Saved" toast appears.
- [ ] AC2 (FR-035, FR-001): Given I set language to FR, then account emails (sign-in, reset) arrive in French and the UI language switch applies at once; an order placed from an EN page still stores locale `en`.
- [ ] AC3 (FR-035): Given an invalid phone or empty name, then field errors are shown and nothing is saved; given a save failure, then a retry is offered.
- [ ] AC4 (FR-035): Given my email, then it is shown read-only (email is the identity; change is out of v1).
- [ ] AC5 (FR-035): Given a phone change, then it applies to future orders only; past orders keep their `contact_*` snapshot.
- [ ] AC6 (FR-035, NFR-003): Given an anonymous visitor, when opening `/account`, then I am redirected to sign-in with `next`; I can only read and edit my own row.
- [ ] AC7 (NFR-002): Given keyboard only, then all fields and Save work in order with visible focus; the toast is announced in a status region; `autocomplete` `name`, `tel` are set; the language field has a visible label.
- [ ] AC8 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then no horizontal scroll; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`; a skeleton shows while loading.
- [ ] AC9 (NFR-007): Given EN and FR, then all strings exist in both.

## Tests
- AC1 → src/app/routes/account/profile.test.ts
- AC2 → src/app/routes/account/profile.test.ts
- AC3 → src/app/routes/account/profile.test.tsx
- AC4 → src/app/routes/account/profile.test.tsx
- AC5 → src/app/routes/account/profile.integration.test.ts
- AC6 → src/app/routes/account/profile.test.ts
- AC7 → src/tests/e2e/account-profile.spec.ts
- AC8 → src/tests/e2e/account-profile.spec.ts
- AC9 → src/app/routes/account/profile.test.tsx

## Notes
- FR-035 is Should; cut together with accounts (cut order #5).
- Uses phone normalisation from S-204.
- Dependencies (R9): S-207, S-204. Not yet done; expected.
