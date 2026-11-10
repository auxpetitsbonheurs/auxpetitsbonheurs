# S-022: Owner-only screens refuse Admins on the server
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#permissions-matrix
Estimate: 3 pts
Owner: auth-specialist, remix-specialist, ui-engineer

## Story
As the bakery Owner, I want Availability, Settings and Team reachable only by Owners, so that a helper cannot change prices, rules or people.

## Acceptance Criteria
- [ ] AC1 (FR-041): Given an Admin session, when I GET `/admin/team`, `/admin/settings` or `/admin/availability`, then the response is HTTP 403 with the "Owner only" state and a back link, and no Owner data.
- [ ] AC2 (FR-041): Given an Admin session, when I POST `invite`, `saveRules` or settings `save` directly, then the response is `FORBIDDEN` (403) and nothing changes.
- [ ] AC3 (FR-041): Given an Owner session, when I open those three pages, then they load.
- [ ] AC4 (FR-041): Given the policy table `OWNER_ONLY_MODULES`, then every module under `/admin` is declared owner-only or admin-allowed (Menu, Promotions, Gallery, Customers, Sales summary, Orders, Calendar, Profile are admin-allowed), and a test fails when a new `/admin` route has no declared policy.
- [ ] AC5 (FR-041): Given an Admin who was just made Owner (or an Owner made Admin), when their next request arrives with the old session, then the new role applies at once (role is read from the database on every request, not cached in the token).
- [ ] AC6 (NFR-002): Given the "Owner only" page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px; focus moves to the `h1`.
- [ ] AC7 (NFR-002, NFR-007): Given light and dark mode, then every text and control pair meets WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations, and the text exists in EN and FR.

## Tests
- AC1 → src/app/routes/admin/owner-only.test.ts and src/tests/e2e/admin-access.spec.ts
- AC2 → src/app/routes/admin/owner-only.test.ts
- AC3 → src/app/routes/admin/owner-only.test.ts
- AC4 → src/app/routes/admin/route-guards.test.ts
- AC5 → src/app/server/auth.server.test.ts
- AC6 → src/tests/e2e/admin-access.spec.ts
- AC7 → src/tests/e2e/admin-access.spec.ts

## Notes
- Depends on: S-009 (E-01), S-021.
- `requireAdmin(request, { role: "owner" })` per architecture "Auth". Availability and Settings routes are built in E-03 (S-056, S-058); this story provides the guard and the policy table, and creates placeholder loaders so the test can run before E-03 lands (the placeholders are replaced by E-03).
- UX: "Owner-only blocked" row in the spec's Screens and states table; empty state from design-system.
