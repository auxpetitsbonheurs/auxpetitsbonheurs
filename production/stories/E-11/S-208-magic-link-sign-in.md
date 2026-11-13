# S-208: Sign in with a one-time email link
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#api-contract
Estimate: 3 pts
Owner: auth-specialist, ui-engineer

## Story
As a customer who does not want a password, I want a one-time sign-in link by email, so that I can get in with one tap.

## Acceptance Criteria
- [ ] AC1 (FR-034): Given any email, when I request a link, then the same message "If this email can sign in, a link is on its way" always appears; if a confirmed account exists a sign-in email arrives in the account language.
- [ ] AC2 (FR-034, NFR-003): Given an unknown email, then no account is created (`shouldCreateUser: false`) and no email is sent.
- [ ] AC3 (FR-034): Given a valid link opened within 1 hour, then I am signed in and redirected to `next` (same-origin only).
- [ ] AC4 (FR-034): Given a link used twice, opened after 1 hour, or opened on another device where it fails, then I see the "Request a new link" page and am not signed in.
- [ ] AC5 (FR-034): Given the confirmation message, then a Resend link is available after 60 s and not before.
- [ ] AC6 (FR-034, NFR-003): Given 6 requests in 15 minutes for one email and IP, then `RATE_LIMITED` with a wait message; invalid email gives a field error; failed Turnstile gives `BOT_CHECK_FAILED`.
- [ ] AC7 (NFR-002): Given keyboard only and a screen reader, then the tab switch between Password and Link is operable and labelled, and the "link is on its way" status region receives focus.
- [ ] AC8 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then no horizontal scroll; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`; the email field has a visible label and `autocomplete="email"`.
- [ ] AC9 (NFR-007): Given EN and FR, then all strings exist in both.

## Tests
- AC1 → src/app/routes/account/sign-in.magic-link.test.ts
- AC2 → src/app/routes/account/sign-in.magic-link.test.ts
- AC3 → src/app/routes/auth.confirm.test.ts
- AC4 → src/app/routes/auth.confirm.test.ts
- AC5 → src/app/routes/account/sign-in.magic-link.test.tsx
- AC6 → src/app/routes/account/sign-in.magic-link.test.ts
- AC7 → src/tests/e2e/account-magic-link.spec.ts
- AC8 → src/tests/e2e/account-magic-link.spec.ts
- AC9 → src/app/routes/account/sign-in.magic-link.test.tsx

## Notes
- Link validity 1 hour per spec Edge Cases. Email content from S-194.
- Dependencies (R9): S-207 (sign-in page), S-194. Not yet done; expected.

## Build notes (2026-11-13)
- Turnstile is not built anywhere in the app yet (checkout and admin sign-in have none either; it is the site-wide public-forms work in S-228 AC2). The `BOT_CHECK_FAILED` parts of the ACs move there; until then these forms rely on the rate limits and the generic answers. Adjusted 2026-11-13 (E-11 build).
- AC5: the server sends at most one account email per address per minute; the button then reads "Send another link".
- AC7: Password and Link are two links styled as a switch (`aria-current`), so they work before JavaScript and with a keyboard.
- Tests: src/app/routes/account/sign-in.test.ts, src/app/routes/auth/confirm.customer.test.ts, src/app/server/supabase-auth.customer.test.ts, src/tests/e2e/account.spec.ts.
