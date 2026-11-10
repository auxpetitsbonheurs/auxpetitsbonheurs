# S-003: Typed environment and per-request database connection
Status: review
Epic: E-01-walking-skeleton
Spec: docs/architecture/architecture.md#data
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist

## Story
As a developer, I want validated settings and one safe way to reach the database, so that missing secrets fail loudly at startup and every feature uses the same connection rules.

## Acceptance Criteria
- [x] AC1 (NFR-012): Given the Worker bindings, when `env.server.ts` parses them with zod, then a missing or malformed variable throws an error that names the variable but never prints any value.
- [x] AC2 (NFR-012): Given `.dev.vars.example`, then it lists every variable the schema reads with placeholder values only (no real secret).
- [x] AC3 (NFR-008): Given `APP_TIME_ZONE`, then any value other than `Indian/Mauritius` is refused at startup; `APP_ENV` must be `development`, `staging` or `production`.
- [x] AC4 (NFR-005, NFR-013): Given a request, when the database is needed, then a Drizzle client is created over the `postgres` driver with `max: 1` and `prepare: false`, and it is closed through `ctx.waitUntil` after the response.
- [x] AC5 (NFR-013): Given a real Postgres test database, when `db.transaction` throws midway, then none of its writes remain.
- [x] AC6 (NFR-003): Given a file with a `.server.ts` suffix, when imported from a client component, then ESLint fails (`no-restricted-imports`).

## Tests
- AC1 → src/app/server/env.server.test.ts
- AC2 → src/app/server/env.server.test.ts (reads `.dev.vars.example`)
- AC3 → src/app/server/env.server.test.ts
- AC4 → src/app/server/db.server.test.ts
- AC5 → src/app/server/db.server.test.ts (integration, in-process PGlite Postgres)
- AC6 → src/app/lib/eslint-boundaries.test.ts (runs ESLint on two fixture strings)

## Notes
- Depends on: S-001.
- Test database: Testcontainers Postgres, seeded per test file. Applying migrations to shared databases stays the user's call.
- Smart Placement is a deploy setting; it is added in S-019 if the CPU/latency numbers justify it.
- Decision: AC5 runs on in-process PGlite (`@electric-sql/pglite`, pinned 0.5.12) instead of Testcontainers: real Postgres semantics, no Docker or network in CI, deterministic. The postgres.js wiring (max 1, prepare false, lazy connect, close in waitUntil) is unit-tested with the real lazy driver, which opens no socket.
- Decision: integration secrets (Resend, VAPID, auth hook, Turnstile, Sentry) are optional only when `APP_ENV=development`; staging and production refuse to start without them. Core Supabase/DB variables are always required.
- Decision: the client is lazy (no connection for requests that never query) and exposed to routes through React Router v8's `RouterContextProvider` as `requestDbContext`; `workers/app.ts` wraps every request in `handleWithDb`.
- Decision: `Database` is typed as the driver-independent `PgDatabase<…, schema>` so services can be tested against PGlite.
- Decision: `.server` boundary applies to UI and isomorphic code (`app/components`, `features`, `welcome`, `domain`, `lib`, `i18n`, `*.client.*`); route modules may import server code in loaders/actions (React Router strips it).
- Decision: test files are typechecked by `tsconfig.test.json`; `src/.env.example` is not readable by this agent (permissions), so variables are documented in `.dev.vars.example` only.
