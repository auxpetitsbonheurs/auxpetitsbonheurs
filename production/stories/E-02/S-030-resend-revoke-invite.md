# S-030: Resend or revoke an invitation
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#edge-cases
Estimate: 2 pts
Owner: auth-specialist, ui-engineer

## Story
As the bakery Owner, I want to resend or cancel an invitation, so that I can fix a lost email or a wrong address.

## Acceptance Criteria
- [ ] AC1 (FR-042): Given an open invitation, when I choose Resend, then the old row is revoked, a new row with a new token and `expires_at` = now + 7 days is created and a new email is queued; the old link now answers `INVITE_INVALID` and the new one works.
- [ ] AC2 (FR-042): Given an open invitation, when I confirm Revoke in the dialog, then its link answers `INVITE_INVALID` and it leaves the pending list.
- [ ] AC3 (FR-042): Given an invitation that was accepted, revoked or does not exist, when Resend or Revoke is posted, then `INVITE_INVALID` or `NOT_FOUND` and nothing changes.
- [ ] AC4 (FR-041): Given an Admin session, when `resendInvite` or `revokeInvite` is posted, then `FORBIDDEN`.
- [ ] AC5 (FR-042): Given a failed send on resend, then the new row stays and Team shows "Email not sent, resend".
- [ ] AC6 (NFR-002): Given the buttons "Resend invitation to {email}" and "Revoke invitation for {email}", then each has a distinct accessible name, the revoke dialog traps focus and returns it on close, the result is announced in a live region, and tap targets are at least 44 px at 320 and 375 px.
- [ ] AC7 (NFR-002): Given light and dark mode, then every pair meets WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/invite-admin.server.test.ts
- AC2 → src/app/server/services/invite-admin.server.test.ts
- AC3 → src/app/server/services/invite-admin.server.test.ts
- AC4 → src/app/routes/admin/owner-only.test.ts
- AC5 → src/app/server/services/invite-admin.server.test.ts
- AC6 → src/tests/e2e/admin-team.spec.ts
- AC7 → src/tests/e2e/admin-team.spec.ts

## Notes
- Depends on: S-028.
- Contract: `resendInvite`, `revokeInvite`. Resend = revoke the open row + insert a new one (data-model "admin_invitation").
