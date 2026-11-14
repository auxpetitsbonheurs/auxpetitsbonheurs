# S-197: Admin controls own push and email alerts from the profile screen
Status: done
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#ux
Estimate: 3 pts
Owner: ui-engineer, accessibility-specialist

## Story
As an admin, I want to turn push and email alerts on or off and enable push on this device, so that I only get the alerts I want, where I want them.

## Acceptance Criteria
- [ ] AC1 (FR-072, FR-046): Given I change the push or email switch, when I save, then `setAlerts` stores it and a "Saved" toast appears; reloading shows the saved state.
- [ ] AC2 (FR-072): Given push is not enabled on this device, then the screen shows "Push is off on this device" with an Enable button; after granting permission the device is subscribed.
- [ ] AC3 (FR-072): Given the browser blocked notifications, then help text "Allow notifications in settings" is shown; given iOS and the app is not installed, then "Add to Home Screen first" is shown.
- [ ] AC4 (FR-072): Given "Send test push", when tapped, then a push arrives within seconds and the button shows a loading state; with no subscribed device, a clear message says so instead of a silent failure.
- [ ] AC5 (FR-072): Given the page is loading, then a skeleton is shown; given `setAlerts` fails, then an inline error with retry is shown.
- [ ] AC6 (NFR-002): Given keyboard only, then switches, Enable and test buttons are reachable in logical order with visible focus and operable with Space/Enter; switches expose name and on/off state to screen readers; toasts are announced via a status region.
- [ ] AC7 (NFR-002, NFR-006): Given 320 px and 375 px widths and 200% zoom, then there is no horizontal scroll and no clipped text; every control has a tap target >= 44 px.
- [ ] AC8 (NFR-002): Given the tokens in `docs/design/tokens.json`, then all text and control states (including disabled and focus) meet WCAG AA contrast; labels are visible and tied to their fields.
- [ ] AC9 (NFR-007): Given EN and FR, then all strings exist in both and long French labels wrap without breaking layout.
- [ ] AC10 (FR-072): Given a customer or anonymous session, when opening `/admin/profile`, then I am redirected to `/admin/login` with no admin data; an admin can change only their own switches.

## Tests
- AC1 → src/app/routes/admin/profile.test.tsx
- AC2 → src/app/routes/admin/profile.test.tsx
- AC3 → src/app/routes/admin/profile.test.tsx
- AC4 → src/app/routes/admin/profile.test.tsx
- AC5 → src/app/routes/admin/profile.test.tsx
- AC6 → src/tests/e2e/admin-profile-alerts.spec.ts
- AC7 → src/tests/e2e/admin-profile-alerts.spec.ts
- AC8 → src/tests/e2e/admin-profile-alerts.spec.ts
- AC9 → src/app/routes/admin/profile.test.tsx
- AC10 → src/tests/e2e/admin-profile-alerts.spec.ts

## Notes
- E-02 builds the profile shell (name, language, password); this story adds the Alerts section. UX: spec UX table "Admin profile > Alerts" and `docs/design/ux/admin-onboarding-team.md`.
- AC7 zoom check automated as a reflow test (viewport at 200% equivalent); the manual 200% check is in S-227.
- Prototype defects (unlabelled steppers, aria-label copies) must not carry over.
- Dependencies (R9): S-196, E-02. Not yet done; expected.

## Implementation notes
- Implemented 2026-11-13. The device states (off, on, blocked, Add to Home Screen, not set up) are decided by `app/lib/push-device.ts` and unit-tested there; the repo has no DOM test library, so the AC1-AC5/AC9 view tests are route tests (`profile.push.test.ts`) plus `tests/e2e/admin-profile-alerts.spec.ts` (French, 320/375/1280, axe) and the existing `admin-profile.spec.ts` (keyboard, 200% zoom, tap targets). E-2e runs without VAPID keys, so it shows the calm "not switched on yet" state.
