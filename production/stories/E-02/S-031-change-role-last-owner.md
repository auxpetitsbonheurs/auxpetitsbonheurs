# S-031: Change an admin's role without losing the last Owner
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#edge-cases
Estimate: 5 pts
Owner: auth-specialist, postgres-specialist, api-engineer, ui-engineer

## Story
As the bakery Owner, I want to make a helper an Owner or an Admin, while the app guarantees there is always one active Owner, so that the bakery is never locked out of its own settings.

## Acceptance Criteria
- [ ] AC1 (FR-043): Given an active Admin, when the Owner changes their role to Owner, then the next request by that person to an Owner page is allowed.
- [ ] AC2 (FR-043, FR-044): Given two active Owners, when one is changed to Admin, then it succeeds.
- [ ] AC3 (FR-044): Given exactly one active Owner, when that Owner is changed to Admin (by themselves), then `LAST_OWNER` shows "There must always be one active Owner. Make someone else Owner first." and the role is unchanged.
- [ ] AC4 (FR-044): Given two Owners who change each other to Admin at the same moment, then exactly one change succeeds and one active Owner remains (the active Owners are locked `SELECT ... FOR UPDATE` in the transaction).
- [ ] AC5 (FR-043): Given an Owner changing their own role while another Owner exists, then it is allowed; given no other active Owner, then `LAST_OWNER`.
- [ ] AC6 (FR-043): Given a role other than Owner or Admin, an empty id or an unknown `adminId`, then `VALIDATION_FAILED` or `NOT_FOUND` and no change.
- [ ] AC7 (FR-041): Given an Admin session, when `changeRole` is posted, then `FORBIDDEN` and no change.
- [ ] AC8 (FR-043): Given the change to Admin, then a confirm Dialog names the person and the consequence ("{name} will lose access to Settings, Availability and Team") before it is applied; a server log line `admin_role_changed {from,to}` is written without personal data.
- [ ] AC9 (NFR-002): Given the role sheet and dialog at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px; the dialog traps focus and the result is announced in a live region.
- [ ] AC10 (NFR-002): Given the controls, then the action names include the person ("Change role of Anna"), the role is shown as text, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/change-role.server.test.ts
- AC2 → src/app/server/services/change-role.server.test.ts
- AC3 → src/app/server/services/change-role.server.test.ts
- AC4 → src/app/server/services/change-role.server.test.ts (Postgres container, two parallel transactions)
- AC5 → src/app/server/services/change-role.server.test.ts
- AC6 → src/app/routes/admin/team.test.ts
- AC7 → src/app/routes/admin/owner-only.test.ts
- AC8 → src/tests/e2e/admin-team.spec.ts and src/app/server/services/change-role.server.test.ts
- AC9 → src/tests/e2e/admin-team.spec.ts
- AC10 → src/tests/e2e/admin-team.spec.ts

## Notes
- Depends on: S-022, S-027.
- Owner decision Q17 (2026-11-10): an Owner may change their own role while another Owner exists.
- The last-Owner check is shared with S-032 through one function `assertNotLastOwner(tx, adminId)`.
