# S-216: Earlier guest orders appear only after I confirm my email
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#data-model-changes
Estimate: 5 pts
Owner: auth-specialist, postgres-specialist

## Story
As a customer who saved my details, I want my earlier orders with the same email to show up once I confirm my email, so that my history is complete and nobody else can read it.

## Acceptance Criteria
- [ ] AC1 (FR-038): Given a guest order with email e, when Save my details is completed, I confirm the email and choose a password, then all earlier orders with e appear in My orders.
- [ ] AC2 (FR-038, NFR-003): Given `auth/confirm` with `type=signup`, then in one transaction `UPDATE customer SET auth_user_id = :uid WHERE email = :confirmedEmail AND auth_user_id IS NULL` runs (or the row is inserted); this is the only place guest orders get linked.
- [ ] AC3 (FR-038, NFR-003): Given an attacker used Save my details or sign-up with the victim's email, when the victim confirms and chooses a password, then no password the attacker could know signs in (G-01).
- [ ] AC4 (FR-038, NFR-003): Given sign-up/save-details unconfirmed, then no order history is visible to anyone using that email until the confirmation link is opened.
- [ ] AC5 (FR-038, NFR-003): Given customer C (email V, phone P) and a guest order with email A and phone P, then the linking never matches by phone: C is unchanged and a separate row for A is used (G-02).
- [ ] AC6 (FR-038): Given two guest customer rows with the same phone but different emails, then they are not merged.
- [ ] AC7 (FR-038): Given the confirmation link is used twice or after expiry, then the second use fails and nothing is linked twice.
- [ ] AC8 (FR-038): Given an `account_created` counter, then it records method (`signup` or `save_details`) and `linkedOrders` with no PII.
- [ ] AC9 (FR-038, NFR-003): Given an email that belongs to an admin, then no customer row is linked and `EMAIL_IN_USE` is shown generically.
- [ ] AC10 (FR-038): Given the DB, then `customer.email` partial unique holds and the link statement is safe under two concurrent confirmations (one wins, no error page).

## Tests
- AC1 → src/tests/e2e/account-save-details-link.spec.ts
- AC2 → src/app/routes/auth.confirm.integration.test.ts
- AC3 → src/app/routes/auth.confirm.integration.test.ts
- AC4 → src/app/routes/account/orders.integration.test.ts
- AC5 → src/app/routes/auth.confirm.integration.test.ts
- AC6 → src/app/routes/auth.confirm.integration.test.ts
- AC7 → src/app/routes/auth.confirm.test.ts
- AC8 → src/app/routes/auth.confirm.test.ts
- AC9 → src/app/routes/auth.confirm.integration.test.ts
- AC10 → src/app/routes/auth.confirm.integration.test.ts

## Notes
- Highest-risk story of the epic (E-11 Risks: account takeover via unconfirmed email linking). Spec AC6b, AC6c, AC23. Security-lead review recommended at /code-review.
- Backend-only slice (no new UI); the visible result is S-213. No UI, so no a11y ACs.
- PRD cut order #4 with S-215. If both are cut, linking at sign-up confirmation (S-206) still applies for accounts that remain.
- Dependencies (R9): S-206, S-215, S-213, E-05. Not yet done; expected.

## Build notes (2026-11-13)
- Built in auth/confirm for sign-up confirmation, sign-in links and customer reset links (every one proves the address): AC2, AC3, AC5..AC7, AC9, AC10 tested in src/app/routes/auth/confirm.customer.test.ts. The Save my details path waits for S-215.
- AC8: `account_created` records method `signup` (sign-up confirmation) or `link` (first link of an account made another way); `save_details` arrives with S-215.
- Save my details path now built (S-215): AC1 and AC4 covered in src/tests/e2e/account.spec.ts; `account_created` records method `save_details` (AC8).
