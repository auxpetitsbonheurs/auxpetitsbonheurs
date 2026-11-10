# S-025: Ask for a password reset link
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#ux
Estimate: 3 pts
Owner: auth-specialist, ui-engineer, remix-specialist

## Story
As an admin who forgot my password, I want to request a reset link from the sign-in page, so that I can get back in without calling anyone.

## Acceptance Criteria
- [ ] AC1 (FR-040): Given an active admin's email, when I submit `/admin/forgot`, then I see "If that email belongs to an admin, a reset link is on its way." and a recovery email is requested with `redirect_to` `/admin/reset`.
- [ ] AC2 (FR-040, NFR-003): Given an unknown email, a customer-only email or a deactivated admin's email, when I submit, then I see exactly the same message and status, and no recovery email is requested.
- [ ] AC3 (FR-040): Given an empty or badly formed email, when I submit, then a field error shows and no request is made; this is the only error shown.
- [ ] AC4 (NFR-003): Given more than the `RL-auth` limit, then `RATE_LIMITED` shows "Too many attempts, wait a few minutes."
- [ ] AC5 (FR-040): Given the sign-in page, then a "Forgot your password?" link opens `/admin/forgot`, and the forgot page links back to sign-in.
- [ ] AC6 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC7 (NFR-002): Given the email field, then it has a visible label, `autocomplete="email"` and an email keyboard; the confirmation message is announced in a live region; light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.
- [ ] AC8 (NFR-007): Given the admin interface language French, then all texts show in French with EN fallback.

## Tests
- AC1 → src/app/routes/admin/forgot.test.ts
- AC2 → src/app/routes/admin/forgot.test.ts
- AC3 → src/app/routes/admin/forgot.test.ts
- AC4 → src/app/routes/admin/forgot.test.ts
- AC5 → src/tests/e2e/admin-reset.spec.ts
- AC6 → src/tests/e2e/admin-reset.spec.ts
- AC7 → src/tests/e2e/admin-reset.spec.ts
- AC8 → src/app/routes/admin/forgot.test.ts

## Notes
- Depends on: S-009 (E-01), S-023, S-024.
- Contract: `admin/forgot` `requestReset` (always `{ ok }`).
- Before sign-in the language comes from the `apb_locale` cookie or browser language (admin `locale` is unknown until signed in).
