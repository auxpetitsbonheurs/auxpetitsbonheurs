# S-029: Accept an invitation and set a password
Status: review
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#acceptance-criteria
Estimate: 3 pts
Owner: auth-specialist, ui-engineer, remix-specialist

## Story
As an invited helper, I want to open my invitation link, choose a password and land in the app, so that I can start helping the bakery.

## Acceptance Criteria
- [x] AC1 (FR-042): Given a valid link, when `/admin/invite/:token` opens, then I see my name, email and role (read-only) and fields for password and language.
- [x] AC2 (FR-042): Given a link 6 days 23 hours old (fixed clock), when I submit a password of 10 or more characters, then the Auth user (confirmed) and the `admin` row are created with the invited role, `accepted_at` is set, I am signed in and I land on `/admin`.
- [x] AC3 (FR-042): Given a link older than 7 days, a revoked link or one already used, then the page shows "This invitation has expired or was already used. Ask the owner for a new one." (HTTP 410, `INVITE_INVALID`) and nothing is created; a second accept of the same link fails the same way.
- [x] AC4 (FR-042): Given a password of 9 characters, then `VALIDATION_FAILED` on `password`; no account is created.
- [x] AC5 (FR-042): Given the Auth user is created but the `admin` insert fails, then the Auth user is removed again so no orphan account stays.
- [x] AC6 (FR-039): Given the invited email became a customer account after the invitation, then `EMAIL_IN_USE` shows and nothing is created.
- [x] AC7 (NFR-003): Given a token that is not 43 base64url characters, then the page answers `INVITE_INVALID` before any database read; the token is compared by its SHA-256 hash.
- [x] AC8 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px; focus moves to the `h1` on load.
- [x] AC9 (NFR-002): Given the password field, then it has a visible label, `autocomplete="new-password"` and a labelled show/hide toggle; errors are linked to fields; light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.
- [x] AC10 (NFR-007): Given the invitation's language is French, then the page opens in French.

## Tests
- AC1 → src/app/routes/admin/invite.test.ts
- AC2 → src/app/server/services/accept-invite.server.test.ts
- AC3 → src/app/server/services/accept-invite.server.test.ts
- AC4 → src/app/routes/admin/invite.test.ts
- AC5 → src/app/server/services/accept-invite.server.test.ts
- AC6 → src/app/server/services/accept-invite.server.test.ts
- AC7 → src/app/routes/admin/invite.test.ts
- AC8 → src/tests/e2e/admin-invite.spec.ts
- AC9 → src/tests/e2e/admin-invite.spec.ts
- AC10 → src/app/routes/admin/invite.test.ts

## Notes
- Depends on: S-009 (E-01), S-028.
- Contract: `admin/invite` loader and `accept`. Auth user is created with the Admin API (`email_confirm: true`, 5 s timeout).
- UX: docs/design/ux/admin-onboarding-team.md (happy path steps 2-3, error table).

## Implementation notes (2026-11-12)
- Accept is rate-limited with the S-023 RL-auth helper (5 per 15 min per IP, counted after the field checks), so trying many links is limited too.
- The Auth user is created with the Admin API (service key, 5 s deadline) before the database transaction; the transaction re-checks that the invitation is still open, and any failure after the Auth user exists deletes it again (AC5).
- `/admin/invite/:token` added to `routes.ts`; the page language follows the invitation (route middleware), and a used or expired link answers in the visitor's language.
- Lead decision 2026-11-12 (sessions): a password change signs out every other device. A brand-new account has no other session, so accept needs no sign-out; My profile and the reset page now call Supabase `signOut({ scope: "others" })` (see S-036).
