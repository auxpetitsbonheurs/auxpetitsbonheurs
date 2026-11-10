# S-021: A customer account can never open admin pages
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#acceptance-criteria
Estimate: 2 pts
Owner: auth-specialist, test-engineer

## Story
As the bakery Owner, I want customer accounts kept out of every admin screen and action, so that customers can never see orders or other customers' data.

## Acceptance Criteria
- [ ] AC1 (FR-039): Given a signed-in customer session, when I open `/admin` or any `/admin/*` page except login, invite, forgot and reset, then I am redirected to `/admin/login`, no admin data is in the response, and my customer session is left as it was (never upgraded).
- [ ] AC2 (FR-039): Given a customer's email and password, when I submit `/admin/login`, then the generic "Email or password is not right" message shows and no admin session is created.
- [ ] AC3 (FR-039, FR-041): Given a customer session, when an admin action is posted from a fetcher (for example `approve`), then the response is `FORBIDDEN` (403) and no data changes.
- [ ] AC4 (FR-039): Given a customer session, when I open `/admin/login`, then the public sign-in page renders and contains no admin data.
- [ ] AC5 (FR-039, FR-041): Given the route table, then a test lists every route under `/admin` and fails if any loader or action does not call `requireAdmin` (so a new route cannot forget the guard).
- [ ] AC6 (NFR-003): Given an anonymous visitor, then the same routes redirect to `/admin/login?next=...` and return no admin data.

## Tests
- AC1 → src/app/routes/admin/guard.test.ts and src/tests/e2e/admin-access.spec.ts
- AC2 → src/app/routes/admin/login.test.ts
- AC3 → src/app/routes/admin/guard.test.ts
- AC4 → src/app/routes/admin/guard.test.ts
- AC5 → src/app/routes/admin/route-guards.test.ts
- AC6 → src/app/routes/admin/guard.test.ts

## Notes
- Depends on: S-009 (E-01, sprint 1).
- Decision recorded in specs README (2026-11-10): customer on `/admin/*` is redirected to `/admin/login`, replacing the earlier 404.
- Test fixture: a Supabase Auth user with a `customer` row and no `admin` row (customer sign-up UI is E-11, so the fixture creates it directly).
- No UI is added here beyond the existing sign-in page, whose accessibility is covered in S-009.
