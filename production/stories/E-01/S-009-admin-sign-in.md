# S-009: Admin sign-in with email and password
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/specs/features/admin-access-team.md#acceptance-criteria
Estimate: 5 pts
Owner: auth-specialist, remix-specialist, ui-engineer

## Story
As the bakery Owner on my phone, I want to sign in once with my email and password and stay signed in for 30 days, so that I can run orders without logging in every time.

## Acceptance Criteria
- [ ] AC1 (FR-040): Given valid admin credentials, when I submit `/admin/login`, then I land on `next` (a relative path) or `/admin`, and the session cookies are HttpOnly, Secure and SameSite=Lax.
- [ ] AC2 (FR-040, NFR-003): Given a wrong password, an unknown email, a deactivated admin, or a valid customer-only account, when I submit, then the same message "Email or password is not right. Try again or reset your password." shows with the same status code for all four.
- [ ] AC3 (FR-040): Given a session created 29 days ago (fixed clock), when I request `/admin`, then it loads; given 30 days and 1 minute, then I am redirected to `/admin/login?next=/admin`.
- [ ] AC4 (FR-040, FR-041): Given I am not signed in, when I request `/admin` or any `/admin/*` page except login, invite, forgot and reset, then I am redirected to `/admin/login?next=...` and no admin data is in the response. The guard `requireAdmin` runs at the top of every admin loader and action, not in a layout only.
- [ ] AC5 (FR-040): Given an empty email, an invalid email format or an empty password, when I submit, then each field shows its own error, the error summary gets focus and lists links to the fields, and no sign-in attempt is made.
- [ ] AC6 (NFR-003): Given `next=https://evil.example` or `next=//evil.example`, when sign-in succeeds, then I land on `/admin` (only relative paths are allowed).
- [ ] AC7 (FR-040): Given I am signed in, when I send POST `/admin/sign-out`, then my cookies are cleared, I land on `/admin/login`, and pressing Back does not show admin data (`Cache-Control: no-store`).
- [ ] AC8 (NFR-003): Given a non-GET admin request whose `Origin` does not match the site host, then it is refused with 403.
- [ ] AC9 (NFR-002): Given the sign-in page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC10 (NFR-002): Given the form, then email and password have visible labels, `autocomplete="username"` and `autocomplete="current-password"`, the show-password toggle has a name ("Show password" / "Hide password") and announces its state, and the loading button stays labelled.
- [ ] AC11 (NFR-002): Given light and dark mode, then every text and control pair meets WCAG AA contrast per docs/design/tokens.json, and an axe scan reports no serious or critical violations.
- [ ] AC12 (NFR-007): Given the admin's language is French, then labels, errors and the generic message appear in French with EN fallback.

## Tests
- AC1 → src/app/server/auth.server.test.ts and src/tests/e2e/admin-sign-in.spec.ts
- AC2 → src/app/routes/admin/login.test.ts
- AC3 → src/app/server/auth.server.test.ts (fixed clock, claims with `amr` timestamps)
- AC4 → src/app/routes/admin/guard.test.ts
- AC5 → src/app/routes/admin/login.test.ts
- AC6 → src/app/server/auth.server.test.ts (`safeNext`)
- AC7 → src/app/routes/admin/login.test.ts and src/tests/e2e/admin-sign-in.spec.ts
- AC8 → src/app/server/origin.server.test.ts
- AC9 → src/tests/e2e/admin-sign-in.spec.ts
- AC10 → src/tests/e2e/admin-sign-in.spec.ts
- AC11 → src/tests/e2e/admin-sign-in.spec.ts
- AC12 → src/app/routes/admin/login.test.ts

## Notes
- Depends on: S-003, S-004, S-006, S-007, S-010 (all in E-01, sprint 1).
- Contract: `admin/login` `signIn`, `admin/sign-out`, `admin/layout` (contracts.md "Admin app"). Roles are only checked as "active admin" here; full Owner/Admin enforcement and customer-session handling are E-02 (S-021, S-022).
- Rate limit on sign-in (RL-auth) is S-023 in E-02; until then the staging site is not announced.
- Session age uses the JWT `amr` sign-in time (architecture "Auth"); verification is local via JWKS.
- Auth calls to Supabase are mocked at the HTTP boundary in unit tests; e2e uses the local Supabase stack.
- UX: sign-in screen row in the spec's Screens and states table; no separate wireframe.
