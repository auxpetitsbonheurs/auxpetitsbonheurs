# Aux petits bonheurs - web app

React Router (framework mode) on Cloudflare Workers, with Supabase (Postgres, Auth,
Storage), Drizzle ORM, Tailwind CSS + shadcn/ui. See
`../docs/architecture/adr/0001-stack.md` for why.

## Run locally

```sh
npm install
cp .dev.vars.example .dev.vars   # fill in local/staging values (never commit)
npm run dev                       # http://localhost:5173
```

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## Deploy (bakery's Cloudflare account; not automated yet)

```sh
npm run deploy:staging
npm run deploy            # production
```

Secrets are set per environment with `npx wrangler secret put <NAME> --env <staging|production>`.
