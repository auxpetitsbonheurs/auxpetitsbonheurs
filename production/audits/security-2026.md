# Security review before launch (S-228)

Reviewer: security-lead · Date: 2026-11-13 · Commit reviewed: origin/main after `ff58f91` · Gate: `SEC-REVIEW`
**Verdict: CONCERNS.** No open critical or high finding. Two highs (missing security headers and CSP, no rate limit on Place order) were fixed in this review. Medium items stay open with owners. Launch is not blocked by this review once the Owner steps below are done and the mediums are fixed or accepted in writing (AC9).

Method: static review of every route module, the Worker entry, the server services, jobs and CI, plus a pass of the git history through gitleaks and a pattern scan, `npm audit`, and new tests (unit and Playwright at 320, 375 and 1280 px). Nothing was run against staging or production, no third party was contacted, and no paid scanner was used.

## Fixed in this review
| ID | Sev (before) | Finding | Fix |
|---|---|---|---|
| SEC-01 | High | No security headers. Pages had no CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` or `Permissions-Policy`, so clickjacking and MIME sniffing were possible, and any injected script would run unchecked (OWASP A05). | `743daef`: `workers/security-headers.ts` adds the baseline headers to every Worker response (static files get `nosniff` from `_headers`). HTML gets a **nonce CSP**, with a fresh nonce on each response. React, `<Scripts>` and the deferred-hydration loader all carry the nonce, and the loader passes it on to the module script it starts. Scripts are limited to `'self'`, the nonce, `'wasm-unsafe-eval'` (HEIC) and `challenges.cloudflare.com` (Turnstile). There is no `unsafe-inline` or `unsafe-eval` for scripts. `frame-src` allows only Turnstile. `img-src` and `connect-src` allow only the Supabase project origin. Fonts are self-hosted. `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` and `form-action 'self'` are set, and HSTS is sent over https. HEIC conversion moved to `heic-to/csp` (no eval). Tests: `workers/security-headers.test.ts`, `app/lib/defer-hydration.test.ts`, `tests/e2e/security-headers.spec.ts` (headers, a nonce on every inline script, a fresh nonce on each view, and no CSP violation while browsing pages, forms and admin hydrate). |
| SEC-02 | High | `placeOrder` had no `RL-order` (contract: 5 per 10 min per IP). A script could create unlimited orders, send order emails to any address and use up the 100-a-day email quota (D7, G-08). | `d9da649`: RL-order. Replays of a placed order are never counted, and the response is 429 with `Retry-After`, the typed values kept and WhatsApp named. The leftovers job later merged it into the order CALL together with Turnstile on Place order (`a1375c1`, migration 0019 `place_order_limited`), with the same rules and copy. |
| SEC-03 | — (CI red) | The gitleaks job on main failed with "leaks found: 1". | `3cd1a2c`. It was a **false positive**: `idempotencyKey: "<uuid>"` in a unit-test fixture (`99b68f9`, `src/app/routes/site/custom-order.test.tsx:18`). It is ignored by its exact fingerprint only. No real secret was found (see Secrets). |

## Open findings
| ID | Sev | Finding | Suggested fix | Owner |
|---|---|---|---|---|
| SEC-04 | M | **Turnstile is missing on the account forms**: sign-in (password and email link), sign-up, password-reset request, Save my details and Write a review. The contract marks them **TS**, and the v0.41 note moved this work to S-228 AC2. Mitigations in place: RL-auth (5 per 15 min per email and IP), RL-signup (3 per hour per IP), RL-email-resend (1 per minute per address), RL-review, and no account enumeration. | Reuse `lib/order-turnstile` and `turnstile.server` (`action` per form). It is off while the keys are unset, as on the other forms. | auth-specialist (accounts job) |
| SEC-05 | M | G-11 is not verified: the Supabase Data API may still expose `public`, and the Storage policies and bucket privacy are not asserted by a check. Authorisation lives only in the app (I3, accepted). | Owner steps 3 and 4 below, plus a setup check asserting that `request-photos` is private and that anon/authenticated users have no write policies. | devops-lead |
| SEC-06 | M | G-12 is for custom-domain day: put the Worker behind the zone, disable `workers.dev` in production, turn on Bot Fight Mode and add the free WAF rate-limit rule on `POST /basket`, `/custom-cake` and `/account/*`. | Add to the deploy-day checklist (S-236). | devops-lead |
| SEC-07 | M | **Fixed 2026-11-14** (privacy job). **Decision:** at most `RECIPIENT_DAILY_CAP` = **3** publicly triggered emails (`order_received`, `request_received`) to one address in any rolling 24 h. The next one is not sent: the row is dead with `recipient_cap`, never retried, and the admin order log says "Not sent: this address already got 3 order or request emails in 24 hours (anti-spam limit)" with the WhatsApp hint (EN/FR). The order itself is always placed and its confirmation page and tracking link work, so a real customer placing a 4th order in a day loses only the email. The count reads the outbox (`lower(to_email)`, status sent) and is preloaded and reserved per run, so parallel sends in one run cannot overshoot. A hashed rate-limit key was not needed: the outbox already holds the address for 90 days (PRV-01). Emails an admin's action triggers (quote, confirmation, update) and account emails are not capped. **Not done, on purpose:** the 30-email reserve for auth and admin emails. S-187 treats order and request emails as critical up to the daily 100, and the per-IP limits (RL-order, RL-request), Turnstile and this cap already bound what one attacker can use; revisit if the quota is ever hit. Code: `server/email/daily-cap.ts`, `process-outbox.server.ts`. Tests: `process-outbox.test.ts`, `routes/admin/order.whatsapp.test.ts`. Was: G-08 is only partly done. The daily cap (100) and RL-order/RL-request per IP exist, but there is no per-recipient cap on public-triggered order and request emails and no reserve for auth and admin emails. Someone using many IPs could still send several emails to one victim address. | Per-recipient limit of 3 per 24 h keyed by `sha256(email)`, and keep 30 of the daily 100 for auth and admin emails. | email-specialist (emails job) |
| SEC-08 | L | G-10: no TOTP MFA for Owner accounts, and the 10-character password minimum for admins is below the threat model's 12. | The Owner decides (`privacy-2026.md` question 8). If declined, record it as an accepted risk. | auth-specialist |
| SEC-09 | L | G-17: the push subscription endpoint allowlist and VAPID rotation runbook are not there yet, because the push sender is still being built. | Apply G-17 when `subscribePush` stores endpoints. | alerts job |
| SEC-10 | L | **Kept, reasoned 2026-11-14** (privacy job): removing `'unsafe-inline'` is not safe. The product photo box's server-rendered `aspect-ratio` would be blocked, so product pages would jump (CLS) until the deferred hydration; the menu drag rows set styles too; Turnstile may style the host page (cannot be verified offline). Scripts stay nonce-only. Reason written in `workers/security-headers.ts`. Owner acceptance still asked (step 5). Was: The CSP keeps `style-src 'unsafe-inline'`, which React `style` attributes need (photo slider, drag rows). Injected CSS could restyle a page but cannot run script. | Accept (recommended), or move those to CSS variables set by class. | Owner to accept |
| SEC-11 | L | **Fixed 2026-11-14** (privacy job): `CUSTOMER_SESSION_MAX_AGE_MS` = 90 days from the `amr` sign-in time in `customerSession` (longer than the admins' 30: customers order every few weeks or months and see only their own orders); older sessions are treated as signed out. Test: `routes/account/profile.test.ts`. Was: Customer sessions have no app-enforced maximum age (admins have 30 days, A3), so a Supabase refresh token keeps a customer signed in indefinitely on that device. | Apply `SESSION_MAX_AGE_MS` in `customerSession` as `adminSession` does. | auth-specialist |
| SEC-12 | L | **Fixed 2026-11-14** (privacy job): `shadcn` moved to `devDependencies` (the build still reads `shadcn/tailwind.css`; the lockfile only flips `dev` flags) and CI runs `npm audit --audit-level=high` after `npm ci` (dev tools included; 0 high today). Tests: `lib/ci-config.test.ts`. The eslint, typescript-eslint and drizzle-kit majors are still to take when released. Was: Dependencies: 0 critical, 0 high, 17 moderate, 2 low, all in dev or CLI tooling (drizzle-kit → `@esbuild-kit`/esbuild dev server, eslint/typescript-eslint → minimatch ReDoS, shadcn CLI → deepmerge). None is in the Worker or client bundles. `shadcn` sits in `dependencies`. CI has no `npm audit` step (G-18). | Move `shadcn` to `devDependencies`. Add `npm audit --omit=dev --audit-level=high` to CI. Upgrade eslint, typescript-eslint and drizzle-kit when their majors land. | devops-lead |
| SEC-13 | L | HEIC conversion now uses `heic-to/csp`. The API is the same and unit tests pass, but no e2e test converts a real HEIC file. | Convert one iPhone photo in the admin and custom cake forms during the device matrix (S-230). | qa (S-230) |
| SEC-14 | L | Not a security issue, noted while testing: `defer-hydration.spec.ts` "a size picked … Add works, after it" fails about 1 in 6 runs under heavy machine load, **with and without** the CSP (a tap lands before the lazy order form hydrates). | Already worked on in `2ee6666`. It still flaked once at 320 px. | lead-frontend |

## AC status
| AC | Status | Evidence |
|---|---|---|
| AC1 roles | Pass (static and existing tests) | Inventory below. `admin-policy.server.ts` plus `route-guards.test.ts` fail when any `/admin` module has no policy, and `requireAdmin({role:"owner"})` returns 403 FORBIDDEN on Availability, Settings and Team. Covered by `admin-access.spec.ts`, `guard.test.ts` and `account.spec.ts`. No separate `security-roles.spec.ts` was written: the existing specs cover the AC. |
| AC2 rate limits and Turnstile | Partial | Every class returns `RATE_LIMITED` with `Retry-After`: RL-auth, RL-signup, RL-email-resend, RL-order (new), RL-request, RL-upload, RL-track and RL-review. Turnstile runs on custom cake, its uploads and Place order. Not on the account forms (**SEC-04**). Keys are CF-Connecting-IP only (G-09). |
| AC3 uploads | Pass (static and existing tests) | Admin and request uploads: type JPEG/PNG/WebP only, ≤ 1 MB, ≤ 5, server-chosen paths inside a session prefix, **magic bytes** read back (`domain/upload.ts`), private `request-photos` bucket, orphans purged after 24 h (G-13, G-15 partly). |
| AC4 tracking tokens | Pass | 32 random bytes in base64url (43 characters), shape-checked before any database read, the same 404 for a wrong or unknown token, `noindex`, `no-store` and `no-referrer` on `/t/*`, `/order/*` and `/auth/confirm` (G-07). Tokens are redacted from request and error logs. |
| AC5 Send Email hook | Pass | Standard Webhooks HMAC with a constant-time compare, a 5-minute timestamp window → 401, a 64 kB body cap, `webhook-id` claimed with `ON CONFLICT DO NOTHING` (a replay sends once), and `redirect_to` checked against the site origin (G-04). Push and email secrets are not in the repo or the client bundle (`check:client-secrets`, gitleaks). |
| AC6 G items | Done here | Gap table below. G-01 and G-02 tests pass (`customer-auth`, `account/orders.test.ts`). |
| AC7 headers and cookies | Pass | SEC-01. Cookies: Supabase session HttpOnly, Secure, SameSite=Lax, 30 days. `apb_confirmed`, `apb_left_out`, `apb_banner_dismissed` and `apb_customer` are HttpOnly, Secure and Lax. `apb_basket` is Secure and Lax but not HttpOnly by design: the browser writes it and it holds ids only (ADR-0004). Open redirect: `safeNext` and `safeCustomerNext` refuse `//`, `/\`, schemes and encoded slashes or controls, with unit tests (G-05). |
| AC8 dependencies and MFA | Partial | SEC-12: no high or critical. Two-step sign-in on the service accounts is an **Owner step**. |
| AC9 launch block | Pass | No critical or high is open. |

## Authorisation inventory (every route, action and endpoint)
Roles: **anon** (visitor), **customer** (signed-in account, `requireCustomer`), **admin** (any active admin, `requireAdmin`), **owner** (`requireAdmin({role:"owner"})`), **token** (bearer token in the URL), **signed** (HMAC). Every admin mutation also passes the same-origin check (`refuseCrossSiteAdminRequest` in the Worker, then `assertSameOrigin`).

| Route | Reads | Mutations | Guard | Notes |
|---|---|---|---|---|
| `/`, `/menu`, `/menu/:slug`, `/our-story`, `/workshops`, `/gallery`, `/contact`, `/reviews`, `/privacy`, `/menu-links`, `*` | public catalogue and content | `menu/:slug` addToBasket (cookie only) | anon | No personal data. Reviews show the display name only once approved. |
| `/basket` | own basket cookie | updateLine, removeLine, **placeOrder** | anon | placeOrder: zod, idempotency replay (same email only, G-21), RL-order and Turnstile, server re-pricing, never matches a customer by phone (G-02). |
| `/custom-cake`, `POST /api/custom-cake/uploads` | public page | submitCustomRequest, upload URLs | anon | RL-request, RL-upload, Turnstile, origin check on uploads, magic bytes. |
| `/order/:token/confirmed`, `/t/:token` | that order only | cancel, acceptQuote, declineQuote (version-checked, status-gated) | token | RL-track. Accepted risk C5: a forwarded email gives access to the order (stated in the privacy note). |
| `/account/sign-in`, `/sign-up`, `/reset`, `/sign-out` | — | password, magicLink, signUp, requestReset, setPassword | anon | RL-auth, RL-signup, RL-email-resend. Admin addresses are refused. G-01: random discarded password until confirmation. **No Turnstile (SEC-04).** |
| `/account`, `/account/orders` | own profile and orders | profile save | customer | Orders are filtered by the account's customer id and the confirmed email (G-02). |
| `/account/save-details?t=` | the order's email and name | saveDetails | token | RL-signup. Links nothing until confirmation. |
| `/reviews/write` | own review | save, delete | customer | RL-review. 403 for an admin session. |
| `/auth/confirm` | — | verifies the emailed link | signed link | `no-store` and `no-referrer`. Expired links go to the sign-in page. |
| `/admin/login`, `/forgot`, `/reset`, `/invite/:token`, `/sign-out`, `/manifest.webmanifest`, `/sw.js` | — | signIn, requestReset, setPassword, accept | public / token | RL-auth. Invite tokens are SHA-256 hashed, expire after 7 days, have their shape checked first and are not consumed on GET. |
| `/admin` (Today), `orders`, `orders/:id`, `menu`, `menu/new`, `menu/:id`, `menu/:id/preview`, `promotions*`, `pages*`, `reviews`, `profile`, `more`, `uploads`, `calendar`, `customers`, `gallery`, `sales`, `*` | admin data | each module's actions | admin | The layout middleware and each loader and action call `requireAdmin`. A customer session posting gets 403 and no data. Profile reads only the session's own row. |
| `/admin/availability`, `/admin/settings`, `/admin/team` | owner data | each module's actions | **owner** | An Admin gets 403 FORBIDDEN (FR-041). |
| `/api/menu`, `/sitemap.xml`, `/robots.txt`, `/healthz` | public | — | anon | `/healthz` has no secrets. |
| `/api/basket/reissue`, `/api/banner/dismiss` | — | cookie only | anon | No database writes of personal data. |
| `POST /hooks/supabase/send-email` | — | sends an auth email | **signed** | See AC5. |
| Cron `scheduled` | — | keepAlive, integrations, purgeRateLimits, purgeStorage, paymentDeadlines, expireQuotes, retryEmails, purgeEmails | Worker only | Each job is idempotent: status-guarded updates, outbox dedupe keys, `FOR UPDATE SKIP LOCKED` leases, version checks. A failing job does not stop the others. |

## Threat-model gaps (G items)
| Gap | Status |
|---|---|
| G-01 pre-account takeover | **Fixed**: random discarded password, password chosen after confirmation. Tests pass. |
| G-02 customer upsert and order listing | **Fixed**: never matches by phone alone or overwrites the email. Orders are listed by linked id and confirmed email. Tests pass. |
| G-03 email domain auth and G-03b MFA | Open, Owner and devops on domain day (DKIM, SPF, DMARC) and Owner step 1 (MFA). |
| G-04 redirect allowlist | **Fixed** in the hook (`nextFromRedirect`). The Supabase URL configuration is an Owner step (deploy-keys). |
| G-05 `next` validator | **Fixed**, with tests. |
| G-06 no state change on GET | **Fixed** for invite and quotes. `/auth/confirm` verifies on GET (Supabase PKCE token_hash), which is accepted: an email scanner that prefetches the link uses up a one-time link and the customer asks for a new one. |
| G-07 token routes: headers and log redaction | **Fixed**. |
| G-08 per-recipient email limits | **Fixed** (SEC-07): 3 per address per 24 h on public-form emails. The auth/admin reserve was declined (see SEC-07). |
| G-09 IP from CF-Connecting-IP only | **Fixed**. |
| G-10 Owner MFA | Open (**SEC-08**, Owner decides). |
| G-11 Data API and Storage policies | Open (**SEC-05**). |
| G-12 WAF and Bot Fight | Open (**SEC-06**, domain day). |
| G-13 upload session and magic bytes | **Fixed**. |
| G-14 siteverify `action` and `hostname` | Partial: success is checked and a network outage fails open with the stricter limit. Check `action` and `hostname` when SEC-04 adds the per-form actions. |
| G-15 global upload cap | Partial: RL-upload per IP and the 24 h orphan purge. There is no 200-a-day global cap. Low impact on a 1 GB free bucket. Owner: lead-backend. |
| G-16 `amr` check and no magic link for admins | Partial: admin addresses are refused on every customer email flow. The `amr` check in `requireAdmin` is not done. |
| G-17 push endpoint allowlist | Open (**SEC-09**). |
| G-18 dependency audit | **Done**: CI step `npm audit --audit-level=high` (SEC-12). |
| G-19 secret scanning | **Done**: gitleaks in CI over the full history and the client-bundle check. |
| G-20 secrets inventory and rotation | Open (L): `docs/runbooks/deploy-keys.md` lists the keys and where they live but has no rotation steps. Add how to rotate each secret, and rotate on any staff or developer handover. Owner: devops-lead. |
| G-21 idempotency key | **Fixed**. |
| G-22 service-worker caching | Not re-verified (admin SW is static assets only per S-035). |
| G-23 CSV and WhatsApp encoding, https-only URLs | Done in sales and settings (`safeWebUrl`, `encodeURIComponent`, CSV guard in S-179). |
| G-24 privacy | See `privacy-2026.md`. |

## OWASP Top 10 (2021) summary
- **A01 access control**: inventory above. Object-level checks hold: tokens, the session's own row, customer id plus email. Pass.
- **A02 crypto**: random tokens from `crypto.getRandomValues`, HMAC-SHA256 cookies and webhooks, HSTS. Pass.
- **A03 injection**: Drizzle and parameterised `sql` only. React escapes output; no `dangerouslySetInnerHTML` in app code (JSON-LD goes through React Router `meta`). Pass.
- **A04 design**: threat model, rate limits, idempotency. Open: SEC-04 (SEC-07 fixed).
- **A05 misconfiguration**: SEC-01 fixed. Open: SEC-05, SEC-06.
- **A06 components**: SEC-12.
- **A07 auth**: no enumeration, RL-auth, session revoke on deactivate and password change. Open: SEC-08, SEC-11.
- **A08 integrity**: signed webhooks, pinned gitleaks with a checksum, lockfile with `npm ci`.
- **A09 logging**: structured, redacted (tokens, emails, numbers). See the privacy audit.
- **A10 SSRF**: no user-supplied URL is fetched by the server. Push endpoints are pending (SEC-09).

## Secrets (repo is public)
- `gitleaks 8.28.0` (checksum-verified) over the full history of `origin/main`: **no leaks** after SEC-03. A second regex pass over `git log -p --all` looked for JWTs, Resend, whsec, AWS, private keys, Postgres URLs with passwords, Turnstile, Google OAuth, GitHub and Supabase tokens, and Sentry DSNs. It found only placeholders (`.dev.vars.example`, `wrangler.jsonc` e2e) and test fixtures. No `.env` or `.dev.vars` file was ever committed, and both are ignored by `.gitignore`.
- No value was printed during this review.

## Owner steps
1. Turn on two-step sign-in for each account below (G-03b, AC8):
   - Cloudflare: My Profile → Authentication → Two-factor authentication → Set up.
   - Supabase: avatar → Account preferences → Security → Multi-factor authentication → Add.
   - GitHub: Settings → Password and authentication → Enable two-factor authentication.
   - Resend: Settings → Account → Two-factor authentication → Enable.
   - Google (backups): myaccount.google.com → Security → 2-Step Verification → Turn on.
2. Save each recovery code in the bakery password manager.
3. Supabase, live project: Project Settings → Data API → Exposed schemas → remove `public` → Save (G-11).
4. Supabase: Storage → `request-photos` → Edit bucket → check "Public bucket" is **off**.
5. Reply in writing: accept SEC-10 (inline styles) and the accepted risks C5, C6 and J6 in `docs/architecture/threat-model.md`, or ask for a fix.
