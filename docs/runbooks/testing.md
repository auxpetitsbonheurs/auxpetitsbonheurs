# Testing: the fast local loop

CI runs every suite on every code push (`.github/workflows/ci.yml`). The repository is
public, so GitHub's standard runners cost nothing (checked 2026-11-13, docs/runbooks/free-plans.md),
but a CI run still takes 12-15 minutes and the suites are what CI is for, so before a push run
only what the change can break, then let CI run the rest.

## Before each push (agents and humans)

All commands run in `src/`.

1. **Static checks** (seconds):

   ```sh
   npm run lint
   npm run typecheck
   ```

2. **Affected unit tests** (seconds): Vitest follows the import graph, so this runs every
   test file that imports something you changed since `origin/main`:

   ```sh
   npx vitest run --changed origin/main
   ```

   Or name the files: `npx vitest run app/server/services/place-order.server.test.ts`.
   The full unit suite takes about a minute on a 4-core machine (`npm test`); run it when
   you changed a shared helper (`app/db/testing/`, `app/server/testing/`, `vitest.config.ts`),
   a migration, or `app/db/schema.ts`.

3. **Affected Playwright specs** (a few minutes): the specs of the journey you touched,
   at the three viewports. The skeleton project always runs first:

   ```sh
   npm run test:e2e -- tests/e2e/admin-menu.spec.ts
   npm run test:e2e -- tests/e2e/checkout.spec.ts -g "AC40"   # one test
   ```

   Run the full e2e suite locally only when you changed something every page uses (the
   root layout, `app.css`, i18n catalogues, auth, the e2e support files, the Playwright
   config). Otherwise CI runs it (two shards, ~13 min).

4. **Build and budgets** when you changed client code: `npm run build && npm run check:js-budget && npm run check:client-secrets`.

## What CI runs

| Job | When | What |
|---|---|---|
| `changes` | every push and PR | decides whether code changed since the last commit whose ci passed |
| `secret-scan` | every push and PR | gitleaks over the history |
| `app` | code changed | lint, typecheck, full unit suite, build, JS budget, client-secret check |
| `e2e` (2 shards) | code changed, in parallel with `app` | full Playwright suite, each shard on its own Postgres |

A commit that changes only `docs/**`, `production/**`, `prototypes/**` or `*.md` outside
`src/` skips `app` and `e2e` but still ends green, so the staging deploy (which waits for a
green ci on the commit) still runs. Docs that unit tests read (`docs/design/**`,
`docs/runbooks/**`, `docs/architecture/cpu-measurements.md`, `docs/product/prd.md` for the Appendix B
transition test) count as code.

## How the unit suite stays fast

`app/db/testing/pglite.ts`: the Vitest global setup migrates one PGlite database per run
and dumps it; each test file loads the dump (~0.4 s), and each test gets that instance
reset to the freshly migrated state (~5 ms: every table emptied and refilled from the
template rows, sequences put back). A test that runs DDL marks the instance dirty and the
next test loads a fresh copy. `createTestDatabase()` keeps its contract: a clean,
migrated database per call, with spies and `close()` local to the test.
