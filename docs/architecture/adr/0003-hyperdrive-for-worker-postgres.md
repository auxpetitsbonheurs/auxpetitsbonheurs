# ADR-0003: Hyperdrive for Worker to Postgres

Status: accepted (refines the "Connection" decision in architecture.md; ADR-0001 unchanged)
Date: 2026-11-11 · Deciders: devops-lead, hosting-platform-specialist; the Owner chose to try Hyperdrive

## Context
The staging CPU measurement (`docs/architecture/cpu-measurements.md`, risk T3) shows hot
paths at p50 24-38 ms CPU against a 10 ms target. Each request opens a new TLS + SCRAM
connection to the Supavisor transaction pooler (port 6543) from inside the Worker, and that
handshake is CPU work billed to the Worker. Cloudflare Hyperdrive keeps pooled connections
warm near the database, so the Worker talks to a local endpoint without the TLS/SCRAM cost.

## Decision
- Use Hyperdrive on the free plan. The Worker reads `env.HYPERDRIVE.connectionString` when the
  binding exists and otherwise falls back to the `DATABASE_URL` secret (local dev, e2e, any
  deploy before the id exists). `DATABASE_URL` is required only when there is no binding
  (`src/app/server/env.server.ts`).
- Client pattern unchanged: one postgres.js client per request, `max: 1`, closed in
  `ctx.waitUntil`, `fetch_types: false`, same timeouts and 25 s request deadline (commit 3c626fb).
  `prepare: false` stays on both paths: Hyperdrive supports prepared statements, but the
  fallback pooler does not and one behaviour on both paths is safer. Revisit after measuring.
- The Hyperdrive id is not a secret. It is a GitHub repository **variable**
  (`STAGING_HYPERDRIVE_ID`, later `PRODUCTION_HYPERDRIVE_ID`). The deploy step passes it as
  `HYPERDRIVE_ID` to `scripts/inject-hyperdrive.ts`, which adds the binding to the built
  `build/server/wrangler.json` after `check-deploy` and before `wrangler deploy`. Empty
  variable: a notice, no binding, deploy continues on `DATABASE_URL`. `wrangler.jsonc` stays
  free of account-specific ids.
- The Hyperdrive configuration points at the Supabase **direct** connection string.

## Consequences
- Free-plan Hyperdrive has daily query and configuration limits; not looked up (documentation
  not reachable from this session): verify in the Cloudflare dashboard (Hyperdrive) before
  relying on it at launch traffic. Cost: 0 on the free plan.
- Supabase's direct connection may be IPv6-only. If Hyperdrive cannot reach it (config creation
  or first queries fail), use the **Session pooler** string (port 5432) in the Hyperdrive
  configuration instead. Do not use the transaction pooler (6543) behind Hyperdrive.
- `DATABASE_URL` remains a required Worker secret until Hyperdrive is proven; it is the
  rollback: unset the GitHub variable and redeploy (or revert the deploy) and the Worker
  uses it again. Migrations and seeds still use the Session pooler URLs from GitHub secrets.
- If the measurement does not improve, remove the variable; no code change needed.
- The e2e and local builds never get the binding.

## Revisit when
The re-measurement after enabling Hyperdrive; free-plan limits change; the bakery moves to a
paid Workers plan.

## Amendment 2026-11-11: staging deploys without Hyperdrive by default
Appended (the decision above is kept as written). Evidence, all staging, same code (f5587fe):
- With the binding (deploy 43057716678): the smoke check got 503 on `/` and `/healthz`;
  cpu-measure 43058081580 got 503 on `GET /menu/chocolate-cake`: both attempts stalled and
  every parameterised query (`settings ... where id = $1`, `product ... where slug = $1`)
  failed with postgres.js `QUERY_TIMEOUT` (5 s). Earlier, run 43053423171 had a 500 on add
  to basket from a failed `product ... in ($1)` query.
- Without it (manual deploy 43058444929, `hyperdrive` unticked): cpu-measure 43058749134,
  10 rounds of product, add to basket, basket, place order and tracking, all 2xx/3xx.
- Likely cause (not proven): postgres.js 4 describes a query whose parameters it cannot type
  (any string) with Parse/Describe/**Flush** and waits before Bind/Sync; through Hyperdrive
  that wait does not return. Queries without parameters (`select 1`) worked.

Decision: automatic staging deploys never inject the binding; a manual **deploy** run with the
`hyperdrive` input ticked does (to re-test). `STAGING_HYPERDRIVE_ID` is kept untouched.
Production still follows `PRODUCTION_HYPERDRIVE_ID`: leave that variable empty.
Revisit by a ticked manual deploy plus cpu-measure after a driver change (e.g. postgres.js
typed parameters or node-postgres) or a Hyperdrive change; the smoke check and cpu-measure
print the failing query's cause from `wrangler tail`.

## Amendment 2026-11-11 (2): Smart Placement on staging; fewer round trips per page
Appended. Trigger: the Owner's phone report (Add to basket "unclickable", no feedback, page
lags; language switch and Place order about 5 s each). Hyperdrive stays off (amendment above).

Before, staging (main ece4ab0), Pixel 7 emulation from a cloud machine, median of 5:
product page TTFB 1.70 s; add-to-basket POST 1.52 s, then the client fetched `/basket.data`
(1.89 s) before anything changed on screen (feedback 4.1 s after the tap); language switch
1.9 s (full page load); Place order POST 4.5 s, confirmation shown 6.5 s after the tap; 4-7
`/__manifest` requests per visit. The Worker runs at the visitor's edge and Supabase is one
region (docs: Mumbai `ap-south-1`); every query is a full round trip and every request opens
a new TLS connection through Supavisor, so a page with connect + 3 sequential queries paid
that distance 6-8 times. Parallel loaders do not help: one connection, `max_pipeline: 1`.

Decision:
- **Smart Placement** (`"placement": { "mode": "smart" }`) on the staging Worker. It is
  offered on every plan, Free included; it moves the Worker next to the backend it talks to
  once Cloudflare has seen enough traffic (a `cf-placement` response header reports
  `remote-…` or `local-…`). Static assets keep coming from the nearest edge. Production gets
  the same line in a release after staging confirms the gain (no production change now).
- **Fewer round trips:** product and photos in one query (json aggregate); the Settings row
  cached per isolate for 60 s for display (footer, basket page), never for money:
  `placeOrder` still reads it fresh, so an edited fee or window applies at once (a stale page
  gets PRICE_CHANGED). After an inline add only the layout revalidates (cookie + cached
  Settings: usually no query).
- **No `/__manifest` requests:** `routeDiscovery: { mode: "initial" }` ships the route manifest
  with the first page.
- **Server-Timing** on every Worker response: `db-connect`, each `db-query`, named reads
  (`product`, `products`, `settings`, `place-order`) and `app`, from postgres.js diagnostics
  channels scoped per request (AsyncLocalStorage). Durations only: no SQL, parameters or PII.
- Front end: Add to basket and Place order show a pending state from tap to result (see the
  catalogue and checkout specs); the language switch and basket link navigate client-side.

Revisit when: `cf-placement` stays `local-…` on staging after a day of traffic (then try a
placement `hint` for the Supabase region), or before promoting placement to production.

Result, staging, same method (median of 5; deploys 43086611698 and 43090537052):

| Step | Before (ece4ab0) | After (ea69b16) |
|---|---|---|
| Product page TTFB | 1.70 s | 1.08 s |
| Add to basket POST | 1.52 s | 1.00 s |
| `/basket.data` | 1.89 s | 1.04 s |
| Tap to visible feedback (Add) | 4.1 s, none before | spinner at once; confirmation 1.14 s |
| Language switch (tap to French page) | 1.9 s, full reload | 1.32 s, client-side |
| Place order POST | 4.5 s | 2.8 s |
| Tap to confirmation page (Place order) | 6.5 s | 4.4 s (busy state throughout) |
| `/__manifest` requests per visit | 4-7 | 0 |

Server-Timing showed a further cause, fixed in ea69b16: with `prepare: false` postgres.js 4
describes every query that has a string parameter before running it (two round trips instead
of one). Strings are now sent as PostgreSQL `unknown` (oid 705), typed by the server like a
quoted literal; every query is one round trip (~180 ms from the US test machine).

Still open: `cf-placement` reported `local-ATL` / `local-YYZ` for the whole session, so Smart
Placement had not moved the Worker yet (it needs traffic to decide). Each request still pays
a new pooler connection (~0.7-0.8 s, about four round trips) plus ~180 ms per query from the
US; from Mauritius the edge is closer to the database. If placement stays local, add
`"hint"` with the Supabase region once confirmed from the project settings (not from secrets).

## Amendment 2026-11-12 (3): node-postgres, Hyperdrive re-tested, one round trip per hot mutation
Appended. Trigger: Place order on staging still took ~4.2 s (median, Pixel 7 emulation) and
basket first visit ~1.2 s; the Owner approved three changes without a prior measurement.

Decision:
- **Driver: node-postgres (`pg` 8.23.1) with `drizzle-orm/node-postgres`**, Cloudflare's
  recommended driver for Hyperdrive. Each parameterised query goes out as one
  Parse/Bind/Describe/Execute/Sync batch with an unnamed statement, so there is no
  Parse/Describe/Flush wait (the likely cause of the postgres.js stalls behind Hyperdrive,
  amendment 1) and it stays valid on the Supavisor transaction pooler. The unknown-type string
  workaround (`pg-params.server.ts`) is gone. Per request: a `pg.Pool` with `max: 1` (a
  transaction holds the only connection; loaders queue), opened lazily, `connectionTimeoutMillis`
  4 s, `query_timeout` 5 s, no idle timer, ended in `ctx.waitUntil` with a 5 s cap. The bounded
  deadline, read retry and 503 behaviour of `handleWithDb` (3c626fb, 1d05168) are unchanged.
  Server-Timing `db-connect`/`db-query` now come from a timed `pg.Client` subclass.
  On Workers the socket is pg-cloudflare's with `cork()`/`uncork()` added
  (`app/server/pg-socket.server.ts`): node-postgres corks around a query's five messages, but
  pg-cloudflare cannot, so each went out as its own small write and the later ones waited for
  the first one's ACK. Staging measured ~400 ms per query instead of ~190 (two round trips)
  until the five messages left in one write.
  `sslmode` keeps libpq's meaning (`uselibpqcompat=true`, `app/lib/pg-url.ts`): node-postgres
  would otherwise treat `require` as verify-full and refuse Supabase's own CA, both in the
  Worker fallback and in `drizzle-kit migrate` (which picks `pg` once it is installed).
- **Hyperdrive: tried on staging, back off by default (same day).** Deploy 43182355823 turned
  it on by default. Cached reads answered in 2-6 ms (Hyperdrive's query cache is **on**), but
  every uncached query, parameterised or a `CALL`, hung until the 5 s query timeout within
  minutes (Place order 500, tracking 500 after two 5 s attempts), exactly as with postgres.js
  in amendment 1. The driver is therefore not the cause; the Hyperdrive configuration's origin
  is the suspect (a pooler whose small pool fills, or a direct host Hyperdrive cannot reach).
  Staging was redeployed without the binding at once (manual run 43183422696, about 8 minutes
  affected, staging only) and automatic staging deploys stay **without** Hyperdrive; a manual
  deploy with `hyperdrive` ticked re-tests it. Production unchanged:
  `PRODUCTION_HYPERDRIVE_ID` stays empty. Before the re-test the Owner sets the origin to
  Supabase's **Direct connection** (or **Session pooler**, port 5432; never the transaction
  pooler, 6543) and turns **caching off** (with it on, the tracking status or an approved order
  can read up to a minute old). The deploy prints the origin kind, port and caching state (no
  host, user or database) once the API token may read Hyperdrive (it got HTTP 403 today).
- **One round trip for Place order.** A forward-only, additive migration
  (`drizzle/0004_place_order_procedure.sql`) adds the `place_order(jsonb, INOUT jsonb)`
  procedure (SECURITY INVOKER, not executable by `anon`/`authenticated`). One `CALL` does the
  idempotency replay lookup, reads Settings and the basket's products, and, when the
  application allowed it (form and date valid), checks window, availability and total and
  writes customer, number, order, items, event and outbox row, all or nothing; a lost race on
  the idempotency key is rolled back (no number consumed) and answered with the winner. The
  application re-prices the returned snapshot with `domain/pricing` for every refusal, so codes,
  fields, lines and totals (ADR-0004 left-out rules, checkout AC31/AC40–47) are as before; a
  disagreement between the two rule sets is logged (`place_order_rule_drift`) and shown as
  PRICE_CHANGED, never as an error. E-05 (options, promotions) must update both. A `CALL` is
  not a plain read, so Hyperdrive never caches it.
- **Approve is one statement** (data-modifying CTEs: versioned UPDATE, event, outbox; current
  status and version returned to explain a refusal). The confirmation page reads order, number
  prefix and left-out names in one query, the tracking page order, items and Settings in one,
  the admin order page order and items in one (prefix from the 60 s display cache).
- **Side effects after the response.** `app/server/after-response.server.ts`: a request's
  deferred tasks start once `handleWithDb` has chosen the response, run under
  `ctx.waitUntil`, and the database client closes after they settle. A failure logs
  `deferred_task_failed` with the task label and error name/code only (no message, no PII) and
  never reaches the customer. Storage clean-up after a product save or delete uses it now;
  Resend, web push and Sentry (E-10, E-12) must use it when they are built. Committing the
  order and its outbox row stays before the response.
- Size: `pg` replaces postgres.js in the Worker; the server bundle stays about 1.4 MB
  gzipped (1,419 kB vs 1,428 kB before; Free limit 3 MB). The client bundle is unchanged
  (`check:js-budget`).

Rollback: revert the commits (the driver works with and without Hyperdrive); the procedure
can stay (nothing else calls it) and a later migration may drop it.

Result, staging, Pixel 7 emulation from a US cloud machine (`cf-placement: local-ORD`),
median of 5, orders "Perf test (staging) — ignore". Before: 01b71d9 (postgres.js) measured
the same day with the same script; ADR-0004's figures in brackets. After: 506dbe6
(node-postgres, corked socket, one-statement mutations), **without** Hyperdrive.

| Step | Before | After |
|---|---|---|
| Place order: tap to confirmation shown | 4,073 ms (4,210) | 2,106 ms |
| Place order POST, server time (Server-Timing `app`) | 2.6-2.9 s: connect + 11 queries | 0.9-1.0 s: connect + 1 query |
| Basket, first visit (Place order visible) | 1,120 ms (1,159) | 1,045 ms |
| Product page TTFB | 1,663 ms | 1,829 ms (same 1-2 queries; noise) |
| Language switch (tap to French page) | 1,380 ms | 1,208 ms (160-220 ms when served client-side) |
| Admin approve (server) | 5 round trips | 1 round trip (not timed: no staging admin login here) |
| Each query | ~180 ms (one round trip) | ~180 ms (~400 ms before the socket was corked) |

What is left is the connection: every request still pays ~0.7 s of TLS and SCRAM to the
Supavisor pooler (four round trips from ORD), twice for Place order (the POST and the
confirmation page). That is what Hyperdrive removes: the one Hyperdrive run that completed
before the stall (deploy 43182355823) measured Place order 643 ms, basket first visit 185 ms
and product TTFB 604 ms. The 1.5 s target needs Hyperdrive working (Owner steps above), or
Smart Placement moving the Worker next to Supabase.

CPU (cpu-measure 43196081265, warm, 50 rounds, no Hyperdrive): place order p50 9 ms (was
24), basket 26 ms (was 38), tracking 20 ms (was 34); p99 30 / 73 / 47 ms, so still above the
10 ms target; no request exceeded the limit (see `cpu-measurements.md`).

## Amendment 4 (2026-11-12): Hyperdrive on for staging
The Owner pointed the staging Hyperdrive config at the Supabase **session pooler (port 5432)** and turned **query caching off**. Deploy 43250574974 confirmed it ("Hyperdrive origin: Supabase session pooler, port 5432; query caching off"). With the node-postgres driver (amendment 3), probes of /api/menu, a product page and /healthz all returned 200 with no hangs.
Decision: staging deploys use Hyperdrive by default, both the automatic deploys after CI and manual runs, where untick `hyperdrive` to fall back to DATABASE_URL. Production stays off (PRODUCTION_HYPERDRIVE_ID empty) until staging has run cleanly through a sprint. Production must then use the same origin type and caching off.
Rejected: the transaction pooler (6543) as origin (it caused the earlier hangs), and Hyperdrive caching (it could show order and tracking data up to a minute old).

## Amendment 2026-11-12 (5): the confirmation after Place order skips the database
Appended. Trigger: amendment 3 left Place order at 2,106 ms (median), of which ~0.9 s was the
confirmation page opening a second database connection (TLS + SCRAM to the pooler) for one
query whose answer the Place order POST had just computed. Lead-approved.

Decision (checkout spec AC48, contracts.md v0.31):
- A new order's redirect also sets **`apb_confirmed`**: base64url JSON of the formatted
  number, the order locale, the left-out names in that locale (at most 10) and an expiry, plus
  an HMAC-SHA256 over `v1.<token>.<payload>`. `Max-Age=600; Path=/order/<token>` (or
  `/fr/order/<token>`; covers the page and its `.data` request); `HttpOnly; SameSite=Lax;
  Secure`. No contact data and no token in the value (the token is only in the path, as for
  `apb_left_out`). A replay sets none.
- `site/order-confirmed` renders from it when it verifies for that token, has not expired (the
  signed expiry, not only the cookie's Max-Age) and its locale is the page's; otherwise it reads
  the database exactly as before (refresh after 10 minutes, another device, a shared link, the
  other language, a tampered or foreign cookie). The page data is the same either way.
- Key: `HMAC(SUPABASE_SERVICE_ROLE_KEY, "apb confirmation cookie v1")`, derived once per
  isolate (`app/server/confirmation-cookie.server.ts`); the secret itself never signs anything
  and nothing new is configured. Rotating that secret (tech-debt: move to Supabase secret keys
  before 2027) only makes outstanding cookies fall back to the database. Without a signer the
  page always reads the database.
- Rejected: rendering the confirmation from the action response (the URL would stay
  `/basket` until a client-side `replace`, and a refresh or Back would re-post or show the form);
  an unsigned cookie (a forged one could show any number on a token page).

Security review (security-lead, self-review): tampering is caught by WebCrypto's
constant-time `verify` over payload and token; a cookie copied to another order's path fails
(token bound); the payload is schema-checked and length-capped before use; replaying a stolen
cookie needs the token anyway and shows no more than the token already shows; no new secret,
no personal data, no token in logs (the request log already redacts token paths).
UX review (ux-lead): same content, focus and URL; refresh and Back behave as before; the
left-out notice (AC41) comes from the signed names first and from `apb_left_out` after.

Rollback: revert the commit; cookies already set are ignored and expire within 10 minutes.

Result, staging, Pixel 7 emulation from a US cloud machine, median of 5, orders "Perf test
(staging) — ignore". Before: f220960 the same day, no Hyperdrive. After: f379011 (this change,
0a3968c, plus Hyperdrive on, amendment 4, deployed in the same run 43250574974), so the two effects are separated with Server-Timing below.

| Step | Before | After |
|---|---|---|
| Place order: tap to confirmation shown | 2,068 ms (2,106 in amendment 3) | 597 ms (457-908) |
| Place order POST, server (`app`) | 864-1,021 ms (connect ~700 + 1 query) | 184-266 ms (connect 9-20 + 1 query) |
| Confirmation load, server (`app`) | 872-972 ms (connect ~730 + 1 query) | 0 ms, no `db-connect` (cookie) |
| Confirmation refresh within 10 min, TTFB | 1,021 ms | 135 ms |
| Confirmation on another device (database path), server | as above | 184-209 ms (connect 7-25 + 1 query) |

Hyperdrive removes the ~0.7 s connection on every request; this change removes the
confirmation's remaining query and connection altogether, ~0.2 s per Place order with Hyperdrive
and ~0.9 s if staging goes back to the pooler without it. One cold-isolate run read the layout's
Settings once (208 ms, the 60 s display cache); the order itself never.

## Amendment 2026-11-13 (6): staging Worker placed in the database's region
Appended. Trigger: S-276 AC7 (LCP ≤ 2.5 s). Staging Server-Timing from the US test machine
still showed `cf-placement: local-ORD` two days after Smart Placement, and every query ~175-190
ms (Home: up to 5 sequential queries, ~0.97 s of `app`; product page ~0.55 s), which put the
simulated TTFB at 1.3-1.6 s.

Decision: staging uses `"placement": { "mode": "targeted", "region": "aws:ap-south-1" }`
(wrangler 4 targeted placement), the region recorded in `docs/runbooks/deploy-keys.md`. A page
then pays one edge-to-Mumbai trip instead of one per query. Verify after the deploy: the
`cf-placement` header names a remote location and `db-query` falls to a few ms. If not (wrong
region, or the plan refuses targeted placement), go back to `"mode": "smart"`. Production gets
the same line in a release once staging confirms it.

Result (deploy 43419501773, 29b6011): `cf-placement: remote-BOM`, but `db-query` stayed at
158-214 ms, so the database is not in Mumbai, and the extra edge-to-Mumbai hop made US TTFB no
better. Follow-up the same day: placement targets the database host instead,
`{ "mode": "targeted", "host": "db.<project-ref>.supabase.co:5432" }` (the project reference is
public, in every photo URL; no credential), so Cloudflare probes it and places the Worker next
to it whatever the region. Same verification and the same way back.
