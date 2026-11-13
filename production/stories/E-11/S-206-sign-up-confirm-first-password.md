# S-206: Sign up with email confirmation, then choose a password
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#api-contract
Estimate: 5 pts
Owner: auth-specialist, ui-engineer

## Story
As a returning customer, I want to create an account with my email and confirm it before choosing a password, so that my account is mine alone and repeat orders are quicker.

## Acceptance Criteria
- [ ] AC1 (FR-034): Given a new email, when I submit name, email, phone (normalised +230) and language on `/account/sign-up` with Turnstile passed, then a confirmation email arrives, the page says "Check your email to confirm", and the account is not usable until I confirm.
- [ ] AC2 (FR-034): Given I open the confirmation link, then I am signed in and redirected to `/account/reset?mode=new&next=/account/orders` to choose a password of at least 10 characters.
- [ ] AC3 (FR-034, NFR-003): Given a password of 9 characters, then `VALIDATION_FAILED` with a field message and the hint "At least 10 characters"; the password step is skippable and a magic link still works.
- [ ] AC4 (FR-034, NFR-003): Given an email already used by a customer or an admin, then the page looks identical to success, no duplicate account exists, and the real owner gets a sign-in email instead of a confirmation (no enumeration; admin emails never create a customer account).
- [ ] AC5 (FR-034, NFR-003): Given an attacker signs up with a victim's email and the victim confirms and chooses a password, then no password known to the attacker signs in (the sign-up form has no password field; server discards a random 32-byte password).
- [ ] AC6 (FR-034, NFR-003): Given 4 sign-ups in an hour from one IP, then the 4th returns `RATE_LIMITED` with `Retry-After` and a friendly wait message; given a failed Turnstile, `BOT_CHECK_FAILED`.
- [ ] AC7 (FR-034): Given a repeat sign-up for a still-unconfirmed email, then only the confirmation is resent (60 s resend limit shown) and no second user is created.
- [ ] AC8 (FR-034): Given an invalid email or phone, then field errors appear next to the fields (phone message "Enter a phone number, e.g. 5712 3456").
- [ ] AC9 (FR-034, NFR-002): Given keyboard only, then the form is fully operable in a logical order, focus is visible, "Check your email" is a status region that receives focus, and the password show/hide control is a button with an accessible name.
- [ ] AC10 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then no horizontal scroll or clipped text; tap targets >= 44 px; all fields have visible labels and `autocomplete` (`name`, `email`, `tel`, `new-password`); errors link via `aria-describedby`; contrast meets WCAG AA per `docs/design/tokens.json`; no puzzle CAPTCHA.
- [ ] AC11 (NFR-007): Given EN and `/fr/account/sign-up`, then every label, error and hint exists in both languages.

## Tests
- AC1 → src/app/routes/account/sign-up.test.ts
- AC2 → src/tests/e2e/account-signup.spec.ts
- AC3 → src/app/routes/account/reset.test.ts
- AC4 → src/app/routes/account/sign-up.test.ts
- AC5 → src/app/routes/account/sign-up.integration.test.ts
- AC6 → src/app/routes/account/sign-up.test.ts
- AC7 → src/app/routes/account/sign-up.test.ts
- AC8 → src/app/routes/account/sign-up.test.tsx
- AC9 → src/tests/e2e/account-signup.spec.ts
- AC10 → src/tests/e2e/account-signup.spec.ts
- AC11 → src/app/routes/account/sign-up.test.tsx

## Notes
- Security (threat-model G-01, G-02) drives AC4 and AC5; contract v0.3/0.4 "no password at sign-up". UX: `docs/design/ux/customer-account.md`.
- Spec says rate limit sign-up 3 per hour per IP; AC6 asserts the 4th.
- Linking of guest orders on confirmation is S-216; the `auth/confirm` plumbing (cookies, redirect) is built here.
- Auth emails come from S-194.
- Cut note: FR-034 is Must; the PRD cut order #5 lists customer accounts as a whole (FR-034..036). Cutting any of E-11 needs a product-director decision for FR-034.
- Dependencies (R9): E-01 (auth shell), S-194, E-02 (admin/customer separation). Not yet done; expected.

## Build notes (2026-11-13)
- Turnstile is not built anywhere in the app yet (checkout and admin sign-in have none either; it is the site-wide public-forms work in S-228 AC2). The `BOT_CHECK_FAILED` parts of the ACs move there; until then these forms rely on the rate limits and the generic answers. Adjusted 2026-11-13 (E-11 build).
- AC4: an admin's address gets no email at all (an admin never has a customer account; admins use /admin/forgot). A confirmed customer gets a one-time sign-in link instead of a confirmation.
- AC7: the 60 s resend limit is enforced on the server (RL-email-resend, one account email per address per minute, silently skipped) and shown as a countdown before "Send the email again".
- AC2: the sign-up details (name, phone, language) are kept in Auth `user_metadata` and only fill a NEW customer row at confirmation; an existing guest row keeps its own name and phone (whoever typed the form cannot change the real owner's details, G-01).
- Tests: src/app/routes/account/sign-up.test.ts, src/app/routes/auth/confirm.customer.test.ts, src/app/routes/account/reset.test.ts, src/tests/e2e/account.spec.ts.
