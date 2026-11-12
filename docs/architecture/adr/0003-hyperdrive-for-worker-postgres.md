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

## Amendment 2026-11-12 (3): node-postgres, Hyperdrive on for staging, one round trip per hot mutation
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
  `sslmode` keeps libpq's meaning (`uselibpqcompat=true`, `app/lib/pg-url.ts`): node-postgres
  would otherwise treat `require` as verify-full and refuse Supabase's own CA, both in the
  Worker fallback and in `drizzle-kit migrate` (which picks `pg` once it is installed).
- **Hyperdrive on for staging by default.** Automatic staging deploys inject
  `STAGING_HYPERDRIVE_ID`; a manual deploy with `hyperdrive` unticked is the rollback (the
  Worker then uses `DATABASE_URL`). Production unchanged: `PRODUCTION_HYPERDRIVE_ID` stays
  empty. The Hyperdrive origin must be Supabase's **Direct** connection or **Session pooler**
  (port 5432), never the transaction pooler (6543), and query **caching must be off** (with it
  on, reads such as the tracking status or the admin order could be up to a minute old). The
  deploy prints the origin kind, port and caching state (no host, user or database) and a
  warning with the Owner's fix when either is wrong (`scripts/inject-hyperdrive.ts`).
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
- CPU and size: `pg` adds about 0.1 MB to the server bundle (Worker limit 3 MB gzipped on
  Free); the client bundle is unchanged (`check:js-budget`).

Rollback: untick `hyperdrive` on a manual staging deploy (driver change stays; it works on
both paths), or revert the commits; the procedure can stay (nothing else calls it) and a later
migration may drop it.
