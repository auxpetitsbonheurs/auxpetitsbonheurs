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

## Backups

Weekly backups to the bakery's own storage; documented in S-020.
