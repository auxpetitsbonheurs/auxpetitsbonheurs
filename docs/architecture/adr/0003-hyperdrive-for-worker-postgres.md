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
