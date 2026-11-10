# Aux petits bonheurs - web app

## What this is

The ordering website of Aux petits bonheurs, a home bakery in Mauritius (EN/FR).
React Router (framework mode) on Cloudflare Workers, with Supabase (Postgres, Auth,
Storage), Drizzle ORM, Tailwind CSS + shadcn/ui. See
`../docs/architecture/adr/0001-stack.md` for why.

## Services and accounts

All accounts belong to the bakery (NFR-012). Filled in by S-002.

## Run locally

```sh
npm install
cp .dev.vars.example .dev.vars   # fill in local/staging values (never commit)
npm run dev                       # http://localhost:5173
```

## Checks

The same steps run in GitHub Actions (`.github/workflows/ci.yml`) on every pull
request and push to `main`, in this order:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run check:js-budget   # gzipped initial JS per route <= project.yaml budgets.js_initial_kb
```

Then a second job runs the browser tests (`npm run test:e2e`, Playwright). Locally:

```sh
# Needs a local Postgres on 127.0.0.1:5432 with user/password postgres/postgres
# (for example: docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16).
npx playwright install chromium   # once
npm run test:e2e                  # builds with CLOUDFLARE_ENV=e2e, serves it, runs at 320/375/1280 px
```

The harness drops and recreates the local database `apb_e2e`, applies the
migrations and seeds the sample product and the test accounts of
`tests/e2e/support/auth-users.ts` (Owner, Admin, French admin, deactivated admin,
customer). Admin sign-in talks to a local GoTrue stub (`tests/e2e/support/gotrue-stub.ts`,
started by Playwright on 127.0.0.1:54321), never to Supabase. Its bindings are the
placeholders in the `e2e` environment of `wrangler.jsonc`; nothing real is used.
If a `.dev.vars` points at a remote database, the test Worker refuses to start
(test mode only talks to a local database): move it aside while running e2e.
To use an already-installed Chromium, set `PW_CHROMIUM_EXECUTABLE=/path/to/chrome`.
Shared helpers live in `tests/e2e/support/`: `expectNoA11yViolations(page, { zoom: 2 })`
(axe, serious and critical fail; 200% zoom also checks for sideways scroll),
`createOrder(db, label)`, `setClock(context, baseURL, instant)` and `signIn(page, account, next?)`.
The walking-skeleton journey (`skeleton-order.spec.ts`) runs first, in its own `skeleton`
project, because it needs the clean database (its order is APB-0001).

## Deploy

Bakery's Cloudflare account; automated deploys are set up in S-002.

### Database migrations

Migrations live in `drizzle/` (`0000_initial` = schema, `0001_launch_seed` = settings,
counter and Storage buckets). Generate with `npm run db:generate`, review the SQL, then
apply with `npm run db:migrate` to **staging first, then production, before the deploy
that needs them**. Each run reads `DATABASE_URL` from your shell for that environment
(direct connection, never committed). Applying migrations is always a person's decision;
tests use an in-process Postgres and never touch a real database.

```sh
DATABASE_URL='<staging connection string>' npm run db:migrate
DATABASE_URL='<production connection string>' npm run db:migrate
```

### Launch checklist

- [ ] Replace the Juice number: `0001_launch_seed` stores the fake placeholder `5000 0000`.
      Set the real one in Settings (or `UPDATE settings SET juice_number = '…'`) on deploy day.
- [ ] Set the full pickup street address (seeded as "Beau Bassin" only).

```sh
npm run deploy:staging
npm run deploy            # production
```

## Secrets

Secrets are set per environment with `npx wrangler secret put <NAME> --env <staging|production>`.
The full list, with placeholders only, is in `.dev.vars.example`. CI needs none.

### Seeding the first Owner (you run this, once per environment)

Creates a confirmed Supabase Auth user and an active `owner` row in `admin`. It is safe to
re-run ("Owner already exists" changes nothing, never the password). It refuses an email that
belongs to a customer. You run it yourself, after the migrations, first for staging, then for
production; CI never does. Type the password at a hidden prompt so it stays out of shell history:

```sh
read -rs OWNER_PASSWORD && export OWNER_PASSWORD     # 10+ characters
export OWNER_EMAIL='owner@…' OWNER_NAME='…' APP_ENV=staging \
  SUPABASE_URL='https://<ref>.supabase.co' SUPABASE_SERVICE_ROLE_KEY='…' DATABASE_URL='postgresql://…'
npm run seed:owner
# production: same with APP_ENV=production and the production project's values, plus
npm run seed:owner -- --confirm-production
```

Output never contains the password, the service-role key or the database URL.

### Sample product (development and staging only)

`npm run seed:sample` inserts "Chocolate cake" (`/menu/chocolate-cake`, Rs 850, one bundled
photo) so the order journey can be tried before the real menu exists. It is idempotent and
refuses `APP_ENV=production`; the price is sample data, not a launch price.

```sh
APP_ENV=staging DATABASE_URL='postgresql://…' npm run seed:sample
```

## Backups

Weekly backups to the bakery's own storage; documented in S-020.
