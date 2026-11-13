# S-209: Reset a forgotten password
Status: review
Epic: E-11-customer-accounts
Spec: docs/specs/features/customer-accounts.md#api-contract
Estimate: 3 pts
Owner: auth-specialist, ui-engineer

## Story
As a customer who forgot my password, I want a reset link by email, so that I can get back into my account.

## Acceptance Criteria
- [ ] AC1 (FR-034): Given any email, when I request a reset, then the same confirmation appears; if an account exists a reset email arrives in the account language.
- [ ] AC2 (FR-034): Given a valid reset link, when I set a new password of at least 10 characters, then the old password stops working and I land on `/account` signed in.
- [ ] AC3 (FR-034): Given a password of 9 characters, then `VALIDATION_FAILED` with a field message and the hint "At least 10 characters".
- [ ] AC4 (FR-034): Given an expired or already used link, then the page says "This link has expired, request a new one" with a one-tap request.
- [ ] AC5 (FR-034, NFR-003): Given 6 reset requests in 15 minutes for one email and IP, then `RATE_LIMITED` with `Retry-After`; failed Turnstile gives `BOT_CHECK_FAILED`.
- [ ] AC6 (FR-034): Given an unauthenticated visitor opening `setPassword` without a recovery session, then the action is refused and nothing changes.
- [ ] AC7 (NFR-002): Given keyboard only, then both forms work in order with visible focus, the show/hide control has an accessible name, errors link via `aria-describedby`, `autocomplete="new-password"` is set.
- [ ] AC8 (NFR-002, NFR-006): Given 320 px, 375 px and 200% zoom, then no horizontal scroll; tap targets >= 44 px; contrast meets WCAG AA per `docs/design/tokens.json`; labels visible.
- [ ] AC9 (NFR-007): Given EN and FR, then all strings exist in both.

## Tests
- AC1 → src/app/routes/account/reset.test.ts
- AC2 → src/tests/e2e/account-reset.spec.ts
- AC3 → src/app/routes/account/reset.test.ts
- AC4 → src/app/routes/auth.confirm.test.ts
- AC5 → src/app/routes/account/reset.test.ts
- AC6 → src/app/routes/account/reset.test.ts
- AC7 → src/tests/e2e/account-reset.spec.ts
- AC8 → src/tests/e2e/account-reset.spec.ts
- AC9 → src/app/routes/account/reset.test.tsx

## Notes
- The `mode=new` first-password path is S-206. Admin reset (`admin/reset`) is E-02.
- Dependencies (R9): S-207, S-194. Not yet done; expected.

## Build notes (2026-11-13)
- Turnstile is not built anywhere in the app yet (checkout and admin sign-in have none either; it is the site-wide public-forms work in S-228 AC2). The `BOT_CHECK_FAILED` parts of the ACs move there; until then these forms rely on the rate limits and the generic answers. Adjusted 2026-11-13 (E-11 build).
- AC4: an expired reset link lands on /account/reset?expired=1, which shows the notice above the request form.
- AC6: setPassword needs a session made by an emailed link (reset, sign-up confirmation or sign-in link) in the last hour that belongs to a customer account; anything else is LINK_EXPIRED. Other devices are signed out after the change.
- Tests: src/app/routes/account/reset.test.ts, src/app/routes/auth/confirm.customer.test.ts, src/tests/e2e/account.spec.ts.
