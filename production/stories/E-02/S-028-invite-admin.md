# S-028: Invite a helper by email
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#acceptance-criteria
Estimate: 5 pts
Owner: auth-specialist, email-specialist, api-engineer, ui-engineer

## Story
As the bakery Owner, I want to invite a helper with their name, email, role and language, so that they can join the app without me creating passwords for them.

## Acceptance Criteria
- [ ] AC1 (FR-042): Given I enter name, email, role Admin and language French, when I send, then an `admin_invitation` row exists with `expires_at` = now + 7 days and a `token_hash` that is the SHA-256 of a 32-byte random token, and a French `admin_invitation` outbox row is queued; the toast says "Invitation sent to {email}".
- [ ] AC2 (FR-042): Given the queued row, when the request has committed, then the minimal sender delivers it after commit (`ctx.waitUntil`); on success the row is `sent` and its payload no longer contains the token.
- [ ] AC3 (FR-042): Given the provider fails or times out (8 s), then the invitation row stays, `emailQueued` is false, and Team shows "Email not sent, resend"; the outbox row stays pending.
- [ ] AC4 (FR-042): Given the email already belongs to an active or deactivated admin or to a customer account, then `EMAIL_IN_USE` shows "This email already has an account." (for a deactivated admin the message adds "Use Reactivate instead") and no row is created.
- [ ] AC5 (FR-042): Given an empty name, an invalid email or a role other than Admin or Owner, then each field shows its own error, the sheet stays open and nothing is created.
- [ ] AC6 (FR-041): Given an Admin session, when `invite` is posted, then `FORBIDDEN` and nothing is created.
- [ ] AC7 (FR-042): Given the invitation email in EN or FR, then it contains the bakery name, the inviter's name, the role in plain words, the link and the expiry ("valid until Thu 19 Nov"), and nothing else personal.
- [ ] AC8 (NFR-002): Given the invite sheet, then it is a dialog with a name, focus is trapped and returns to the trigger on close, Esc closes it, every field has a visible label and linked errors, and the error summary takes focus on a failed send.
- [ ] AC9 (NFR-002): Given the sheet at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px; light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/invite-admin.server.test.ts
- AC2 → src/app/server/email/sender.server.test.ts
- AC3 → src/app/server/email/sender.server.test.ts and src/app/server/services/invite-admin.server.test.ts
- AC4 → src/app/server/services/invite-admin.server.test.ts
- AC5 → src/app/routes/admin/team.test.ts
- AC6 → src/app/routes/admin/owner-only.test.ts
- AC7 → src/app/server/email/templates.test.tsx
- AC8 → src/tests/e2e/admin-team.spec.ts
- AC9 → src/tests/e2e/admin-team.spec.ts

## Notes
- Depends on: S-024 (sender and Resend adapter), S-027.
- Contract: `admin/team` `invite` (returns `{ ok, emailQueued }`).
- Decision: the invitation link contains the plaintext token, so the outbox payload holds it until sent (or dead) and is then cleared; only the hash is kept in `admin_invitation` (data-model, threat model). The data-model's "plaintext only in the email" holds after the scrub.
- Wording and the FR translation of the email are reviewed by `copywriter` before launch (E-12).
