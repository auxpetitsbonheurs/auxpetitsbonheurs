
## From review of S-001/S-003/S-004/S-010 (2026-11-10)
- [x] DONE 2026-11-10 (reset password + confirm email via Auth Admin API before reuse; tests in seed-owner.server.test.ts). TD: seed-owner reuses any existing auth.users row with the owner email without resetting password / checking email_confirmed_at (src/app/server/services/seed-owner.server.ts:80-83). Fix before running seed on production. Medium.
- TD: db.server.ts closes the client when the Response returns; streamed loader promises would query after close. Add a guard/test before any streaming loader. Medium.
- TD: threat-model G-19 — add gitleaks + client-bundle secret-name check to CI. Medium.
- Low: `.catch` on waitUntil(close()); refuse APP_ENV=development on production Worker; CI cancel-in-progress also cancels main runs.

## From review of S-005..S-008 (2026-11-10)
- TD: root.tsx ErrorBoundary/Layout fall back to lang="en" + empty messages when root loader fails; /fr error page can show raw keys. Medium.
- TD: wrangler.jsonc top-level env is APP_ENV=development; a bare `wrangler deploy` without --env runs lax. Guard in S-002. Medium.
- TD: add `Vary: Cookie, Accept-Language` on locale redirects before any cache/CDN. Low.

## From S-011..S-013 (2026-11-10)
- TD: site layout middleware still reads `request.url`, so client data requests are judged on `/x.data` paths (no redirect today because in-site requests never redirect). Use the normalised URL. Low.
- TD: `updateLine` does not check `product.min_quantity` (contracts.md); add with E-05 when a product has a minimum. Low.
- TD: e2e `fillOrder` relies on `Date` field typing in Chromium; when the E-05 date picker replaces the native input, update the helper. Low.

## From review of S-011..S-013 (second pass, 2026-11-10)
- TD: placeOrder accepts any future date (no upper bound) and no rate limit/Turnstile yet; staging must stay closed until E-05 (noted in S-013). Medium.
- [x] DONE 2026-11-10 (S-014: key lookup before validation, lost race returns the winner; tests in place-order.server.test.ts and checkout.spec.ts). TD: a repeated submit with the same `idempotencyKey` hits the unique constraint and 500s until S-014 lands. Medium.
- TD: basket cookie is unsigned by design (no prices, ids re-validated against the DB); tampering can only add products that exist, but add a total-quantity cap if abuse appears. Low.
- Low: `contracts.md` changelog lists v0.4/v0.3 out of order; tidy when next edited.

## From security review of S-014/S-015/S-016 (2026-11-10)
- TD: idempotency replay is not bound to the submitter (threat-model G-21 not implemented; contracts v0.8 "changed payload still gets the redirect" contradicts it). Anyone holding a form's `idempotencyKey` (shared phone, cached page) gets the original order's tracking token, and their own order is silently not created (src/app/server/services/place-order.server.ts:73-74, :95). Fix: replay only when the posted `contact.email` matches the order's email (an emptied basket still replays); otherwise refuse with `VALIDATION_FAILED` and render a fresh key. Needs the contract change agreed by lead-backend + lead-frontend. Medium.
- TD: `/basket` sends no `Cache-Control` (architecture.md Rendering table requires `no-store`) although the HTML now carries a per-render `idempotencyKey` that maps to an order token; any edge cache rule or history cache could share one key across visitors (src/app/routes/site/basket.tsx:29-54, and the placeOrder redirect). Add `no-store` (route middleware like token-page.server.ts) for loader, data and action responses. Medium.
- Low: when E-05 adds step 3 (RL-order + Turnstile), keep the key lookup (step 2) behind the rate limit or count replays, so the unauthenticated lookup is not an unlimited oracle (place-order.server.ts:73). RL-track on `/t/*` and `/order/*` (threat-model C1) is still to apply in E-05.
- Low (a11y): Place order uses `disabled` while sending, which drops keyboard focus to `body` (src/app/components/checkout/summary-section.tsx:127); prefer `aria-disabled` + ignoring resubmits so focus stays on the button.
- Low (a11y): Share opens WhatsApp in a new tab without telling the user (src/app/components/order/copy-actions.tsx:51); add visually hidden "(opens in a new tab)".
- Low: confirmation `trackingUrl` is built from the request origin (src/app/routes/site/order-confirmed.tsx:37); safe on Cloudflare routes, but build it from a configured site URL before any preview or non-Cloudflare host.
