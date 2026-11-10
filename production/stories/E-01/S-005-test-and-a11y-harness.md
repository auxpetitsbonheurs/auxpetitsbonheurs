# S-005: End-to-end and accessibility test harness
Status: review
Epic: E-01-walking-skeleton
Spec: docs/architecture/architecture.md#quality-attributes
Estimate: 3 pts
Owner: test-engineer

## Story
As the bakery's developer, I want a ready browser-test setup with a built-in accessibility check at phone widths, so that every later screen is tested the same way from the first day.

## Acceptance Criteria
- [x] AC1 (NFR-006): Given `npm run test:e2e`, then Playwright starts the built app and runs the same spec in three viewports: 320 px, 375 px and 1280 px wide.
- [x] AC2 (NFR-002): Given a page containing a known violation (an unlabelled input), when `expectNoA11yViolations(page)` runs, then the test fails and prints the rule and element; given a clean page, then it passes. The helper fails on serious and critical violations.
- [x] AC3 (NFR-002): Given the helper, when called with `{ zoom: 2 }`, then it sets 200% zoom (CSS zoom/viewport emulation) and also asserts no horizontal scroll (`scrollWidth <= clientWidth`).
- [x] AC4 (NFR-013): Given a spec, when it needs data, then a helper resets and seeds a Postgres test database with the sample product and one Owner; each spec creates its own order data and runs in parallel without clashing.
- [ ] AC5 (NFR-012): Given the CI workflow, then an `e2e` job runs the suite after the unit tests on pull requests and main, with traces kept on failure and no fixed sleeps in specs.
- [ ] AC6: Given a fixed clock helper, when a spec sets "now" to a Mauritius date, then server-rendered dates use it (via an injectable clock binding, test mode only).

## Tests
- AC1 → src/tests/e2e/smoke.spec.ts
- AC2 → src/tests/e2e/support/a11y-helper.spec.ts
- AC3 → src/tests/e2e/support/a11y-helper.spec.ts
- AC4 → src/tests/e2e/support/seed-helper.spec.ts
- AC5 → .github/workflows/ci.yml (e2e job; shape asserted by src/app/lib/ci-config.test.ts, which also forbids fixed sleeps in specs; a real CI run is still needed, so AC5 stays unticked until the branch is pushed)
- AC6 → src/tests/e2e/support/clock-helper.spec.ts

## Notes
- Depends on: S-001.
- Auth in e2e uses a local Supabase stack (Supabase CLI, Docker) per architecture "Environments"; no real network to third parties.
- Test-mode clock must be impossible to enable in production (guarded by `APP_ENV`); covered in S-003's env tests when added.
- Decision: the built Worker is served by `vite preview` with `CLOUDFLARE_ENV=e2e`; its bindings are committed placeholders in the `e2e` env of wrangler.jsonc (rationale: build-time `CLOUDFLARE_INCLUDE_PROCESS_ENV` would copy the whole shell env into `build/server/.dev.vars`).
- Decision: the database is a local Postgres (`apb_e2e`, CI service container `postgres:16`) instead of the Supabase CLI stack (rationale: no Docker-in-Docker needed, auth is not exercised until S-009); the reset helper refuses non-local hosts and names without "e2e".
- Decision: the test clock is the `apb_test_now` cookie, honoured only with `TEST_CLOCK=on`; env.server.ts refuses TEST_CLOCK outside development and with a non-local DATABASE_URL (rationale: per-context clocks keep parallel specs independent).
- Decision: 200% zoom is emulated by halving the CSS viewport (what browser zoom does to layout and media queries), not CSS `zoom`, which leaves media queries at 100%.
- Decision: `@playwright/test` and `playwright-core` pinned to 1.63.0; `PW_CHROMIUM_EXECUTABLE` lets a pre-installed Chromium be used; CI runs `playwright install chromium`.
- Decision: the template welcome page is replaced by a minimal home (h1 + footer year from the request clock) so the smoke and clock specs have a real SSR date.
