# S-035: Install the admin app on the home screen
Status: review
Epic: E-02-admin-access-team
Spec: docs/specs/features/admin-access-team.md#acceptance-criteria
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, hosting-platform-specialist

## Story
As an admin on Android or iPhone, I want to add the app to my home screen, so that it opens like a normal app and can later receive alerts.

## Acceptance Criteria
- [x] AC1 (FR-047): Given `/admin/manifest.webmanifest`, then it has scope `/admin/`, start URL `/admin`, display `standalone`, the bakery name, theme colours from tokens, and icons 192 and 512 plus a maskable icon.
- [x] AC2 (FR-047): Given `/admin/sw.js`, then it is served with `Cache-Control: no-cache` and a scope of `/admin/`; it handles `push` (shows title, body from the payload) and `notificationclick` (opens `data.url`), as defined in the push payload contract.
- [x] AC3 (FR-047): Given Android Chrome and the first visit after sign-in, when the browser offers installation, then an in-app "Install" button appears; pressing it opens the native prompt; "Not now" hides it and it does not return in this browser.
- [x] AC4 (FR-047): Given iOS Safari not in standalone mode, then a one-line hint "Share, then Add to Home Screen" shows once after sign-in with a dismiss button; given standalone mode or any other browser, then it does not show.
- [x] AC5 (FR-047): Given the app is already installed (standalone), then no install prompt or hint shows.
- [x] AC6 (FR-047): Given the manifest and service worker, then they are public (no sign-in needed) and contain no admin data or secrets.
- [x] AC7 (NFR-002): Given the install banner at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then its buttons are reachable with a visible focus indicator, tap targets are at least 44 x 44 px, it never covers the bottom bar, and it is announced politely (not as an alert).
- [x] AC8 (NFR-002, NFR-007): Given light and dark mode, then every pair meets WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations, and the text exists in EN and FR.

## Tests
- AC1 → src/app/routes/admin/manifest.test.ts
- AC2 → src/app/routes/admin/manifest.test.ts and src/app/lib/sw-handlers.test.ts (service worker logic as pure handlers)
- AC3 → src/tests/e2e/admin-install.spec.ts (Chromium `beforeinstallprompt` fixture)
- AC4 → src/app/lib/install-hint.test.ts (user-agent and standalone detection)
- AC5 → src/app/lib/install-hint.test.ts
- AC6 → src/app/routes/admin/manifest.test.ts
- AC7 → src/tests/e2e/admin-install.spec.ts
- AC8 → src/tests/e2e/admin-install.spec.ts

## Notes
- Depends on: S-009 (E-01), S-033.
- Contract: "static" row (`/admin/manifest.webmanifest`, `/admin/sw.js`) and the push payload shape. Sending push, subscribing devices, the "Turn on push" control and the test push (spec AC24) are E-10, as the epic scope says ("only installs the app and exposes the profile switches").
- Spec test AC24 on real iPhone and Android is a manual device check recorded in E-10's test session.
- Vitest includes only `app/**` and `workers/**`: the `sw.js` logic lives in `src/app/lib/sw-handlers.ts` (built into `public/admin/sw.js`), so its test is co-located there.

## Built (2026-11-12, batch 7)
- AC1 deviation (recorded in contracts.md v0.30): the manifest's start URL is `/admin/`, not `/admin`: a start URL outside the scope `/admin/` makes browsers drop the scope. `/admin/` opens Today.
- The service worker is served by a route (`routes/admin/sw.tsx`) from one plain-JS string in `src/app/lib/sw-handlers.ts` instead of a built `public/admin/sw.js`; its test runs that exact string against a fake service-worker global. Icons are in `src/public/admin/` ("apb" monogram, Libre Caslon Display, cream on `primary-strong`).
- "First visit after sign-in" is implemented as: on any admin page until dismissed (Not now / Hide this tip, remembered in localStorage) or installed.
