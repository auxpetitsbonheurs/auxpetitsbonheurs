# S-036: My profile with name, language, password and alert switches
Status: ready
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#acceptance-criteria
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, auth-specialist

## Story
As an admin, I want to update my name, language and password and choose which alerts I get, so that the app fits how I work.

## Acceptance Criteria
- [ ] AC1 (FR-046): Given My profile, when I change my name and language to French and save, then "Saved" shows and the admin interface is in French from the next load.
- [ ] AC2 (FR-046): Given an empty name or a name over 80 characters, then `VALIDATION_FAILED` shows on `name` and nothing changes.
- [ ] AC3 (FR-046): Given a new password of 10 or more characters, when I save, then it is changed and my current session stays signed in; given 9 characters, then `VALIDATION_FAILED` on `password`.
- [ ] AC4 (FR-046): Given the switches "Push alerts" and "Email alerts" (both on by default), when I turn one off and save, then `admin.alert_push` or `admin.alert_email` is stored and shows the same after reload.
- [ ] AC5 (FR-046): Given the profile page, then it shows only my own data; no id in the URL or form can edit another admin; anonymous visitors are redirected to login and customers (S-021) are refused.
- [ ] AC6 (FR-046): Given the push switch, then next to it the page shows "Push devices: 0" and the line "Turning on push on this device is added with notifications"; the switch value is saved even though no device is registered yet.
- [ ] AC7 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC8 (NFR-002): Given the form, then every field and switch has a visible label tied to it, the result is announced in a polite live region, errors are linked to fields with the summary taking focus, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/admin/profile.test.ts
- AC2 → src/app/routes/admin/profile.test.ts
- AC3 → src/app/routes/admin/profile.test.ts
- AC4 → src/app/routes/admin/profile.test.ts
- AC5 → src/app/routes/admin/guard.test.ts
- AC6 → src/app/routes/admin/profile.test.ts
- AC7 → src/tests/e2e/admin-profile.spec.ts
- AC8 → src/tests/e2e/admin-profile.spec.ts

## Notes
- Depends on: S-009 (E-01), S-021, S-033.
- Contract: `admin/profile` `updateProfile`, `changePassword`, `setAlerts`. `subscribePush`, `unsubscribePush` and `sendTestPush` are E-10 (epic scope).
- Open question not decided by the owner (spec "Open Questions"): should changing one's password end other devices' sessions? Proposed yes. This story keeps the current session and does not specify the other sessions; if the owner decides yes, a follow-up AC is added.
- Alert switches are stored here; they are honoured by the alert rules in E-10 (FR-072).
