# S-196: Installed admin app receives web push, including a test push
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#api-contract
Estimate: 5 pts
Owner: mobile-specialist, api-engineer

## Story
As an admin with the app installed on my phone, I want to subscribe this device to push and send myself a test, so that I know alerts will reach me.

## Acceptance Criteria
- [ ] AC1 (FR-072, FR-047): Given an installed app and permission granted, when `subscribePush` is called with a valid `{ endpoint, keys: { p256dh, auth } }`, then the subscription is stored for that admin and `pushDevices` increases by 1; resubscribing the same endpoint does not create a duplicate.
- [ ] AC2 (FR-072): Given `sendTestPush`, then a push is sent to the caller's own devices only and `{ ok, sent: n }` is returned.
- [ ] AC3 (FR-072): Given a payload `{ title, body, url, tag }` in the admin's locale, when tapped, then `sw.js` opens the payload `url` (`/admin/orders/<id>` or `/admin/calendar/<date>/prep`) in the app.
- [ ] AC4 (FR-072): Given the push service answers 404 or 410, then that subscription is deleted and a `push_gone` counter is recorded; other devices still receive.
- [ ] AC5 (NFR-003): Given an invalid body (non-URL endpoint, missing keys), then `VALIDATION_FAILED`; given a customer or anonymous caller, then 401/403 and nothing is stored.
- [ ] AC6 (NFR-003): Given a push send takes more than 5 s, then it times out without blocking the originating action.
- [ ] AC7 (NFR-004): Given a payload, then it never contains address, phone or order items.
- [ ] AC8 (NFR-003): Given VAPID keys, then they come from typed env, are documented as placeholders only in `.env.example` and never logged.
- [ ] AC9 (NFR-006): Given an iPhone with the installed app and an Android phone, when a test push is sent, then it arrives within seconds on both (manual device check).
- [ ] AC10 (FR-072): Given `unsubscribePush` with an endpoint of another admin, then nothing is deleted (`NOT_FOUND`/no-op).

## Tests
- AC1 → src/app/routes/admin/profile.push.test.ts
- AC2 → src/app/routes/admin/profile.push.test.ts
- AC3 → src/tests/e2e/admin-push-sw.spec.ts
- AC4 → src/app/server/push/push.server.test.ts
- AC5 → src/app/routes/admin/profile.push.test.ts
- AC6 → src/app/server/push/push.server.test.ts
- AC7 → src/app/server/push/push.server.test.ts
- AC8 → src/app/server/env.test.ts
- AC9 → production/test-sessions/push-device-check.md
- AC10 → src/app/routes/admin/profile.push.test.ts

## Notes
- The PWA install itself is E-02 (FR-047). AC9 is a manual device check recorded in a test-session note; it is the Phase 5 exit (push on iPhone and Android). If iOS push fails the spike (T1), email fallback applies to the four push+email alerts only; raise to product-director.
- Dependencies (R9): E-02 (installable PWA, profile route). Not yet done; expected.
