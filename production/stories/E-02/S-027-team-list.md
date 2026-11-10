# S-027: Team screen listing admins and pending invitations
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#ux
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, tailwind-shadcn-specialist

## Story
As the bakery Owner, I want to see who has access and which invitations are waiting, so that I always know who can open the app.

## Acceptance Criteria
- [ ] AC1 (FR-042): Given admins and open invitations, when I open `/admin/team`, then admins are listed with name, role, an "Active" or "Deactivated" text badge and last sign-in (Mauritius time), and invitations with name, email, role and expiry date ("valid until Thu 19 Nov").
- [ ] AC2 (FR-042): Given I am the only admin, then I see my row and "Only you for now. Invite a helper." and the invitations section is hidden.
- [ ] AC3 (FR-041): Given an Admin session, when opening `/admin/team`, then 403 "Owner only" (see S-022); given an anonymous visitor, then a redirect to login.
- [ ] AC4 (FR-042): Given expired, revoked or accepted invitations, then they are not listed as pending.
- [ ] AC5 (FR-042): Given the data takes longer than 300 ms, then skeleton rows show; given a load failure, then an Alert with a Retry button shows.
- [ ] AC6 (FR-042): Given each row, then one button "Actions for {name}" opens the row sheet (the actions themselves arrive in S-028 to S-032).
- [ ] AC7 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC8 (NFR-002): Given the list, then it is a semantic list, status is shown as text (not colour only), each action button has a distinct name that includes the person, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.
- [ ] AC9 (NFR-007): Given the Owner's language is French, then the labels and dates show in French (Propriétaire / Administrateur).

## Tests
- AC1 → src/app/routes/admin/team.test.ts
- AC2 → src/app/routes/admin/team.test.ts
- AC3 → src/app/routes/admin/owner-only.test.ts
- AC4 → src/app/routes/admin/team.test.ts
- AC5 → src/tests/e2e/admin-team.spec.ts
- AC6 → src/tests/e2e/admin-team.spec.ts
- AC7 → src/tests/e2e/admin-team.spec.ts
- AC8 → src/tests/e2e/admin-team.spec.ts
- AC9 → src/app/routes/admin/team.test.ts

## Notes
- Depends on: S-009 (E-01), S-022, S-033.
- Contract: `admin/team` loader. Route is `/admin/team` (decision 2026-11-10; prototype's `/admin/more/team` dropped).
- UX: `docs/design/ux/admin-onboarding-team.md` (states per screen).
