# S-032: Deactivate and reactivate an admin
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#data-model-changes
Estimate: 5 pts
Owner: auth-specialist, postgres-specialist, api-engineer, ui-engineer

## Story
As the bakery Owner, I want to switch off a helper's access at once and switch it back on later, so that someone who leaves can no longer see orders but our history keeps their name.

## Acceptance Criteria
- [ ] AC1 (FR-043): Given an active Admin signed in on a phone, when the Owner deactivates them, then `admin.active` is false, `deactivated_at` is set, the Auth user is banned, and their push subscriptions are deleted.
- [ ] AC2 (FR-043): Given the deactivated Admin's open tab, when they make their very next request, then a page request redirects to `/admin/login`, an action called by fetcher returns `UNAUTHENTICATED` (401), and their data is not returned.
- [ ] AC3 (FR-043, FR-045): Given the Admin had order events, when deactivated, then the activity log still shows their name on those events.
- [ ] AC4 (FR-044): Given exactly one active Owner, when the Owner deactivates themselves, then `LAST_OWNER` and no change.
- [ ] AC5 (FR-044): Given two Owners who deactivate each other at the same moment, then exactly one succeeds.
- [ ] AC6 (FR-043): Given a deactivated Admin, when the Owner reactivates them, then the ban is lifted, `deactivated_at` is cleared, the role is unchanged, they must sign in again and their password is unchanged.
- [ ] AC7 (FR-043, NFR-003): Given a deactivated Admin, when they try to sign in, then the generic "Email or password is not right" message shows.
- [ ] AC8 (FR-043): Given the Auth ban call fails or times out (5 s), then `admin.active` stays false (access is already blocked), the Owner sees "Deactivated. Signing out their devices will be retried" and a Retry button, and repeating the action is safe.
- [ ] AC9 (FR-041): Given an Admin session, when `deactivate` or `reactivate` is posted, then `FORBIDDEN`; given an unknown `adminId`, then `NOT_FOUND`.
- [ ] AC10 (NFR-002): Given the confirm Dialog "Deactivate {name}?" at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs, every tap target is at least 44 x 44 px, focus is trapped, and the result is announced in a live region.
- [ ] AC11 (NFR-002): Given the buttons "Deactivate {name}" and "Reactivate {name}", then each name is distinct, the state is shown as text ("Deactivated"), and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/deactivate-admin.server.test.ts
- AC2 → src/app/server/auth.server.test.ts and src/tests/e2e/admin-team.spec.ts
- AC3 → src/app/server/repos/order-events.server.test.ts
- AC4 → src/app/server/services/deactivate-admin.server.test.ts
- AC5 → src/app/server/services/deactivate-admin.server.test.ts (Postgres container)
- AC6 → src/app/server/services/deactivate-admin.server.test.ts
- AC7 → src/app/routes/admin/login.test.ts
- AC8 → src/app/server/services/deactivate-admin.server.test.ts
- AC9 → src/app/routes/admin/owner-only.test.ts
- AC10 → src/tests/e2e/admin-team.spec.ts
- AC11 → src/tests/e2e/admin-team.spec.ts

## Notes
- Depends on: S-018 (E-01, event log), S-027, S-031 (shared `assertNotLastOwner`).
- Admin rows are never deleted (FR-043). `push_subscription` rows are removed here even though delivery is E-10.
- AC8 is a decision on a spec gap: the architecture says deactivation blocks via the flag and bans via the Admin API but does not say what happens when the ban call fails.
