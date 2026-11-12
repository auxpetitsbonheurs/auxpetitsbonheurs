
## From review of S-001/S-003/S-004/S-010 (2026-11-10)
- [x] DONE 2026-11-10 (reset password + confirm email via Auth Admin API before reuse; tests in seed-owner.server.test.ts). TD: seed-owner reuses any existing auth.users row with the owner email without resetting password / checking email_confirmed_at (src/app/server/services/seed-owner.server.ts:80-83). Fix before running seed on production. Medium.
- TD: db.server.ts closes the client when the Response returns; streamed loader promises would query after close. Add a guard/test before any streaming loader. Medium.
- [x] DONE 2026-11-12 (ci.yml: `secret-scan` job runs a pinned, SHA-256-verified gitleaks over the whole history with reviewed false positives in .gitleaksignore; `npm run check:client-secrets` after the build fails on any server secret name or known value in build/client). TD: threat-model G-19 — add gitleaks + client-bundle secret-name check to CI. Medium. Pre-commit hook not added (CI is the gate; Owner works from the browser).
- Low: `.catch` on waitUntil(close()); CI cancel-in-progress also cancels main runs.
- [x] DONE 2026-11-10 (top level is not deployable + scripts/check-deploy.ts in the deploy scripts; deployed envs require https SUPABASE_URL; tests in deploy-guard.test.ts, env.server.test.ts). Low: refuse APP_ENV=development on production Worker.

## From review of S-005..S-008 (2026-11-10)
- TD: root.tsx ErrorBoundary/Layout fall back to lang="en" + empty messages when root loader fails; /fr error page can show raw keys. Medium.
- [x] DONE 2026-11-10 (top-level Worker renamed `auxpetitsbonheurs-local` with no workers.dev URL/route/cron; deploy scripts build with CLOUDFLARE_ENV and refuse a build for another env). TD: wrangler.jsonc top-level env is APP_ENV=development; a bare `wrangler deploy` without --env runs lax. Guard in S-002. Medium.
- TD: add `Vary: Cookie, Accept-Language` on locale redirects before any cache/CDN. Low.

## From S-011..S-013 (2026-11-10)
- TD: site layout middleware still reads `request.url`, so client data requests are judged on `/x.data` paths (no redirect today because in-site requests never redirect). Use the normalised URL. Low.
- TD: `updateLine` does not check `product.min_quantity` (contracts.md); add with E-05 when a product has a minimum. Low.
- TD: e2e `fillOrder` relies on `Date` field typing in Chromium; when the E-05 date picker replaces the native input, update the helper. Low.

## From review of S-011..S-013 (second pass, 2026-11-10)
- TD: placeOrder accepts any future date (no upper bound) and no rate limit/Turnstile yet; staging must stay closed until E-05 (noted in S-013). Medium.
- [x] DONE 2026-11-10 (S-014: key lookup before validation, lost race returns the winner; tests in place-order.server.test.ts and checkout.spec.ts). TD: a repeated submit with the same `idempotencyKey` hits the unique constraint and 500s until S-014 lands. Medium.
- TD: basket cookie is unsigned by design (no prices, ids re-validated against the DB); tampering can only add products that exist, but add a total-quantity cap if abuse appears. Low.
- [x] DONE 2026-11-11 (reordered with contracts v0.14). Low: `contracts.md` changelog lists v0.4/v0.3 out of order; tidy when next edited.

## From security review of S-014/S-015/S-016 (2026-11-10)
- [x] DONE 2026-11-10 (replay only when the posted email matches the order's; else neutral VALIDATION_FAILED with a fresh key; contracts v0.9; tests in place-order.server.test.ts and basket.test.ts). TD: idempotency replay is not bound to the submitter (threat-model G-21 not implemented; contracts v0.8 "changed payload still gets the redirect" contradicts it). Anyone holding a form's `idempotencyKey` (shared phone, cached page) gets the original order's tracking token, and their own order is silently not created (src/app/server/services/place-order.server.ts:73-74, :95). Fix: replay only when the posted `contact.email` matches the order's email (an emptied basket still replays); otherwise refuse with `VALIDATION_FAILED` and render a fresh key. Needs the contract change agreed by lead-backend + lead-frontend. Medium.
- [x] DONE 2026-11-10 (route middleware `noStore` from server/response-headers.server.ts on page, data and action responses; tests in basket.test.ts and checkout.spec.ts "M2"). TD: `/basket` sends no `Cache-Control` (architecture.md Rendering table requires `no-store`) although the HTML now carries a per-render `idempotencyKey` that maps to an order token; any edge cache rule or history cache could share one key across visitors (src/app/routes/site/basket.tsx:29-54, and the placeOrder redirect). Add `no-store` (route middleware like token-page.server.ts) for loader, data and action responses. Medium.
- Low: when E-05 adds step 3 (RL-order + Turnstile), keep the key lookup (step 2) behind the rate limit or count replays, so the unauthenticated lookup is not an unlimited oracle (place-order.server.ts:73). RL-track on `/t/*` and `/order/*` (threat-model C1) is still to apply in E-05.
- Low (a11y): Place order uses `disabled` while sending, which drops keyboard focus to `body` (src/app/components/checkout/summary-section.tsx:127); prefer `aria-disabled` + ignoring resubmits so focus stays on the button.
- Low (a11y): Share opens WhatsApp in a new tab without telling the user (src/app/components/order/copy-actions.tsx:51); add visually hidden "(opens in a new tab)".
- Low: confirmation `trackingUrl` is built from the request origin (src/app/routes/site/order-confirmed.tsx:37); safe on Cloudflare routes, but build it from a configured site URL before any preview or non-Cloudflare host.

## From security review of S-009/S-017/S-018 (2026-11-10)
- [x] DONE 2026-11-12 (S-023: RL-auth in Postgres, 5 per 15 min per email + IP and action, keyed on CF-Connecting-IP; Supabase's own per-IP limit on the shared egress IP remains, see the S-023 review note). Was: sign-in rate limit is a placeholder (`signInAllowed()` always true, src/app/server/auth.server.ts:133); threat-model A5 stays partial. Supabase's own per-IP limits see the Worker's shared egress IP, so they throttle everyone at once (brute force slowed, but admins can be locked out by an attacker). Build RL-auth (S-023) before staging is announced; user to accept or not. Medium.
- TD: `order_event` is append-only by convention only (src/app/server/repos/order-events.server.ts); the DB role can UPDATE/DELETE. Add a trigger refusing UPDATE/DELETE (FK cascade on order delete excepted) or revoke those privileges for the app role (threat-model A9, NFR-013). Medium.
- [x] DONE 2026-11-10 (result region always rendered, sr-only while empty, focused on success; assertions in tests/e2e/admin-approve.spec.ts AC2). TD (a11y): Approve success text goes into a `role="status"` region that is `empty:hidden` (display:none) until filled (src/app/routes/admin/order.tsx:248-250), so some screen readers miss it; and the focused Approve button is removed after success, dropping focus to `body` (order.tsx:251-258). Keep the region always rendered (sr-only when empty) and move focus to the status/heading. Medium.
- Low: Worker CSRF pre-check `ADMIN_PATH` is case-sensitive and not decoded (src/app/server/origin.server.ts:37), while React Router matches case-insensitively and decodes (`/ADMIN/...`, `/%61dmin/...`). The admin middleware and `requireAdmin` still refuse cross-site mutations, so no bypass; make the regex `i` and test the decoded path for defence in depth.
- Low: session cookies use the `sb-<ref>-auth-token` name without a `__Host-` prefix (src/app/server/supabase-auth.server.ts:12), so a compromised sibling subdomain could plant cookies (fixation). Consider `cookieOptions.name` with `__Host-` once Supabase SSR supports it on all chunks.
- [x] DONE 2026-11-10 (e2e env has no workers.dev URL; check-deploy refuses TEST_CLOCK/local addresses; staging/production refuse non-https SUPABASE_URL). Low: a bare `wrangler deploy` right after an e2e run uploads the e2e build (TEST_CLOCK=on, SUPABASE_URL 127.0.0.1); harmless today (no reachable DB/auth) but add a guard that refuses non-https SUPABASE_URL outside the e2e build, alongside the existing APP_ENV TD.
- [x] DONE 2026-11-11 (staging-preflight requires a successful ci run for the SHA on manual runs). Medium (deploy.yml:34-47): `workflow_dispatch` on `main` deploys staging without CI having passed for that commit. Gate on a green `ci` run for the SHA, or accept as a deliberate Owner override.
- Medium (deploy.yml:97-110): the staging-before-production check accepts any `success` deployment status, which GitHub records before the staging smoke step runs, so a commit whose `/healthz` or noindex check failed still counts as "staging runs it". Mark the deployment only after the smoke step, or re-curl staging in the production preflight.
- Medium (deploy.yml, all workflows): `actions/*@v5` are major-version pins (allowed by rules/infra.md); pin to commit SHAs once Dependabot for Actions is on. Also backup.yml:24-39 exposes every secret at job level to all steps including `apt-get`; scope each to its step.
- Low (deploy.yml:104): production preflight does not verify the `production` branch commit descends from `main`; branch protection on `production` (restrict pushes to the Owner) is the control, document it in the runbook.
- Low: Cloudflare token template is "All zones" (deploy-keys.md section 1); narrow to the bakery zone once a domain exists.

## From ADR-0002 amendment 1: core-only first deploy (2026-11-10)
- TD (launch blocker): `TURNSTILE_SECRET_KEY` is optional at startup. When E-05 adds Turnstile verification it must check `integrationConfigured(env, "turnstile")`: in production a missing key must refuse public form submissions (or the launch must be blocked), never skip verification silently; in staging it may skip with a logged warning. Public launch requires the key; `npm run check:launch -- production --strict` must pass on the launch checklist. Medium.
- TD (launch blocker): email (`RESEND_API_KEY`, `EMAIL_FROM`) is optional at startup; E-10's sender must leave outbox rows `pending` (no attempts consumed) while unconfigured, so they go out once the keys are set. Production public launch requires it. Medium.
- Low: Sentry (when added) must be a no-op without `SENTRY_DSN`; push and the auth email hook stay off without their keys (`integrationConfigured`).
- Low: `scripts/check-deploy.ts` checks the build, not the Worker's secrets; launch readiness runs after the deploy (needs the Worker to exist). A first production deploy therefore always warns until the secrets are entered.

## CPU (risk T3) — Owner decision 2026-11-11: accept and monitor
- [ ] Alert on Worker `exceededCpu` / error 1102 in staging and production (fold into E-12 observability story).
- [ ] Re-run cpu-measure on staging before launch; if any request is blocked, raise Workers Paid ($5/month) with the Owner.
- [ ] Hyperdrive needs a different driver (postgres.js param-type round-trip stalls through it); revisit only if CPU becomes a problem.

## From review of sprint 02 batch 3 (S-047, S-048, S-049, S-042; 2026-11-12)
- TD: uploaded photos that are never saved (editor closed before Save, or a new photo removed before Save) stay in `public-images` under `products/<adminId>/<uploadSessionId>/`. Add an hourly job that lists that prefix and removes objects older than a day that no `product_photo` row references. Low (free 1 GB; ~300 kB each).
- TD: `/admin/uploads` has no rate limit (admin-only, contract "Admin actions are not rate-limited beyond auth"); a compromised admin session could fill Storage. Fold into the cleanup job's alerting or add RL-upload for admins if abuse appears. Low.
- TD: customer side of option groups (picker, `textOptionProblem`, price with options, `isInSeason` on the chosen date) lands in E-04/E-05; `priceLines` still ignores options. Must be done before any product with priced options is offered. Medium (tracked by E-04/E-05 stories).
- TD: admin menu `fromPriceRs` is still the base price; with a required Size group whose smallest choice is not Rs 0 it should be base + lowest required choice (`lowestOptionPrice`). Low.

## From sprint 02 batch 4 (2026-11-12)
- TD: unit suite takes about 15 minutes on CI (a fresh PGlite database per test, 1600+ tests); the app job timeout was raised to 25 minutes. Share one migrated PGlite snapshot per file (clone or truncate between tests) or shard `npm test`. Medium.
- TD: the S-011 sample and `scripts/cpu-load.ts` default to `/menu/chocolate-cake`, which the real menu (S-241) turns into a hidden Rs 0 cake on staging; pass `--product chocolate-chip-cookies` (or a priced cake) to cpu-load until the default follows the menu. Low.
- TD: the public product page does not show option groups yet (E-02 builds it), so on staging the cookies add as the Rs 420 base (Box of 6) with no box choice. Low (staging only; E-02 in this sprint).
