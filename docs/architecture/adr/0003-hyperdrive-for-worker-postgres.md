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
