# S-207: Sign in with my password and sign out safely
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#api-contract
Estimate: 5 pts
Owner: auth-specialist, ui-engineer

## Story
As a returning customer, I want to sign in with my email and password and sign out, so that I can use my saved details and orders.

## Acceptance Criteria
- [ ] AC1 (FR-034): Given a confirmed account, when I sign in with the right password, then I land on `next` or `/account`.
- [ ] AC2 (FR-034, NFR-003): Given a wrong password or an unknown email, then the same generic message "Email or password is wrong" appears and no account existence is revealed (same response timing class).
- [ ] AC3 (FR-034, NFR-003): Given 6 attempts in 15 minutes for one email and IP, then the 6th returns `RATE_LIMITED` with `Retry-After` and a "Too many tries, wait {n} min" message.
- [ ] AC4 (FR-034, NFR-003): Given `next` is an external URL or `//host`, then it is ignored and I land on `/account`; a same-origin path is honoured.
- [ ] AC5 (FR-034): Given a signed-out visitor opens a customer page, then I am redirected to `/account/sign-in?next=<path>`; after sign-in I return there.
- [ ] AC6 (FR-034): Given Sign out (POST), then the session ends, I am redirected to `/`, and the back button shows no private data.
- [ ] AC7 (FR-034): Given an expired session on a customer page, then I am redirected to sign-in with `next`.
- [ ] AC8 (FR-039): Given a customer session, when opening `/admin` or calling an admin action, then I am redirected to `/admin/login` or get `FORBIDDEN` and no admin data; given an admin email, then it cannot sign in at the customer page as a customer.
- [ ] AC9 (FR-034): Given the guest flow, when I place an order without any account, then it succeeds with no sign-in prompt; the top bar shows Sign in when signed out and Account when signed in.
- [ ] AC10 (FR-034, NFR-003): Given an empty email or password, or a failed Turnstile, then `VALIDATION_FAILED` / `BOT_CHECK_FAILED` field errors; cookies are HttpOnly, Secure, SameSite=Lax.
- [ ] AC11 (NFR-002): Given keyboard only, then the form, show/hide password button and submit work in order with visible focus; errors are announced and linked with `aria-describedby`; fields have `autocomplete` `email` and `current-password`.
- [ ] AC12 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then no horizontal scroll; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`; labels are visible.
- [ ] AC13 (NFR-007): Given `/fr/account/sign-in`, then all text is French; EN fallback for a missing string.

## Tests
- AC1 → src/tests/e2e/account-signin.spec.ts
- AC2 → src/app/routes/account/sign-in.test.ts
- AC3 → src/app/routes/account/sign-in.test.ts
- AC4 → src/app/routes/account/sign-in.test.ts
- AC5 → src/tests/e2e/account-signin.spec.ts
- AC6 → src/tests/e2e/account-signin.spec.ts
- AC7 → src/app/server/auth/require-customer.test.ts
- AC8 → src/tests/e2e/account-admin-separation.spec.ts
- AC9 → src/tests/e2e/account-guest-checkout.spec.ts
- AC10 → src/app/routes/account/sign-in.test.ts
- AC11 → src/tests/e2e/account-signin.spec.ts
- AC12 → src/tests/e2e/account-signin.spec.ts
- AC13 → src/app/routes/account/sign-in.test.tsx

## Notes
- FR-039 is owned by E-02; AC8 is the customer-side regression check (spec AC28). Spec states AC1 (guest ordering) as part of FR-034.
- Rate limit of 5 per 15 min per email+IP from spec Edge Cases.
- Cut note: see S-206 (FR-034 Must).
- Dependencies (R9): S-206, E-02 (`requireAdmin` redirect), E-05 (checkout). Not yet done; expected.

## Build notes (2026-11-13)
- Turnstile (2026-11-14, reusing E-08's `useTurnstile` and `turnstileContext`): the form carries the invisible widget's token and the server answers BOT_CHECK_FAILED for a missing or bad one (after the rate limit, before any Auth call); without configured keys the check is skipped, as on the custom-cake form. Test: src/app/routes/account/bot-check.test.ts.
- AC9: the top bar shows the account icon from 1024 px ("Sign in" / "My account") and the phone menu has the same row under the 7 links. It reads a display-only cookie (`apb_customer`), never a token, so browsing pages do no auth work; `/account` verifies the session.
- AC13: implemented as an `account` text bundle served by the account layout (not shipped with browsing pages).
- AC7 test lives in src/app/routes/account/profile.test.ts (the guard) instead of a separate require-customer test.
- Tests: src/app/routes/account/sign-in.test.ts, src/app/routes/account/profile.test.ts, src/tests/e2e/account.spec.ts (S-021's admin-access spec keeps covering /admin with a customer session).
