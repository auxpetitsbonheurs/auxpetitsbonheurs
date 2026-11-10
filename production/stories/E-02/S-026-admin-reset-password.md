# S-026: Set a new password from the reset link
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#acceptance-criteria
Estimate: 3 pts
Owner: auth-specialist, ui-engineer, remix-specialist

## Story
As an admin with a reset link, I want to choose a new password and be signed in, so that I can carry on straight away.

## Acceptance Criteria
- [ ] AC1 (FR-040): Given a valid recovery link, when `/auth/confirm?token_hash=...&type=recovery&next=/admin/reset` is opened, then the code is verified, a session is set and I land on `/admin/reset`.
- [ ] AC2 (FR-040): Given I am on `/admin/reset` with that session and enter a password of 10 or more characters, when I submit, then the password is set, I am signed in and I land on `/admin` (Today).
- [ ] AC3 (FR-040): Given a password of 9 characters or an empty field, when I submit, then `VALIDATION_FAILED` shows on `password` ("At least 10 characters") and nothing changes.
- [ ] AC4 (FR-040): Given an expired, used or missing recovery session, when I open `/admin/reset` or submit, then I see "This link has expired. Request a new one." with a link to `/admin/forgot` (HTTP 410).
- [ ] AC5 (NFR-003): Given a recovery session for a customer-only account or a deactivated admin, when I submit a new password, then a generic error shows and no admin session is created.
- [ ] AC6 (NFR-003): Given a `next` that is an absolute URL, then it is ignored and the redirect is `/admin/reset`.
- [ ] AC7 (NFR-003): Given the `RL-auth` limit is exceeded, then `RATE_LIMITED` shows the wait message.
- [ ] AC8 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC9 (NFR-002): Given the password field, then it has a visible label, `autocomplete="new-password"`, a labelled show/hide toggle that announces its state and a visible rule "At least 10 characters"; errors are linked to the field; light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/auth/confirm.test.ts
- AC2 → src/app/routes/admin/reset.test.ts and src/tests/e2e/admin-reset.spec.ts
- AC3 → src/app/routes/admin/reset.test.ts
- AC4 → src/app/routes/admin/reset.test.ts
- AC5 → src/app/routes/admin/reset.test.ts
- AC6 → src/app/routes/auth/confirm.test.ts
- AC7 → src/app/routes/admin/reset.test.ts
- AC8 → src/tests/e2e/admin-reset.spec.ts
- AC9 → src/tests/e2e/admin-reset.spec.ts

## Notes
- Depends on: S-009 (E-01), S-023, S-024, S-025.
- Contract: `auth/confirm` (this story builds the `recovery` type only; E-11 adds `signup`, `magiclink`, `email_change` and guest-order linking) and `admin/reset` `setPassword`.
- Spec gap/decision: the open question "does a password change end other sessions" applies to My profile (S-036), not to a reset; a reset signs out nothing else here.
