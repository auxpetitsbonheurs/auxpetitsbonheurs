# Stack Matrix

Maps `project.yaml → stack` values to the specialist agent, the default
scaffold command, and the test / lint / typecheck commands. `/setup-stack`,
`/adopt`, `/test-setup`, `test-run.sh` and the hooks read this table.
Commands assume `pnpm` for JS/TS; swap for the configured
`stack.package_manager` (`npm`, `yarn`, `bun`).

Scaffold commands are **printed** for the user and run only after an explicit
yes. Confirm flags against the tool's current `--help`: scaffolders change
their prompts between versions.

## Frontend (`stack.frontend`)

| Value | Specialist | Scaffold (default) | Unit tests | Lint / typecheck |
|---|---|---|---|---|
| `nextjs` | `nextjs-specialist` | `pnpm create next-app@latest <dir> --ts --tailwind --eslint --app --src-dir` | `vitest` + Testing Library | `pnpm lint`, `pnpm tsc --noEmit` |
| `remix` | `remix-specialist` | `pnpm create react-router@latest <dir>` | `vitest` | `pnpm lint`, `pnpm typecheck` |
| `nuxt` | `nuxt-vue-specialist` | `pnpm create nuxt@latest <dir>` | `vitest` + `@nuxt/test-utils` | `pnpm lint`, `pnpm nuxi typecheck` |
| `sveltekit` | `sveltekit-specialist` | `pnpm dlx sv create <dir>` | `vitest` | `pnpm lint`, `pnpm check` |
| `astro` | `astro-specialist` | `pnpm create astro@latest <dir>` | `vitest` | `pnpm lint`, `pnpm astro check` |
| `angular` | `angular-specialist` | `pnpm dlx @angular/cli@latest new <dir> --ssr` | Angular's configured runner (`ng test`) | `pnpm ng lint`, `pnpm tsc --noEmit` |
| `solidstart` | `solid-qwik-specialist` | `pnpm create solid@latest <dir>` | `vitest` + `@solidjs/testing-library` | `pnpm lint`, `pnpm tsc --noEmit` |
| `qwik` | `solid-qwik-specialist` | `pnpm create qwik@latest` | `vitest` | `pnpm lint`, `pnpm build.types` |
| `none` | — | — | — | — |

Styling `tailwind-shadcn` → `tailwind-shadcn-specialist`; after the framework
scaffold: `pnpm dlx shadcn@latest init` (React-family). For Vue/Svelte use the
community ports (`shadcn-vue`, `shadcn-svelte`) and say so.

## Backend (`stack.backend`)

| Value | Specialist | Scaffold (default) | Unit tests | Lint / typecheck |
|---|---|---|---|---|
| `native` | the frontend specialist | (framework route handlers / server actions) | as frontend | as frontend |
| `express` | `node-backend-specialist` | `pnpm init` + `pnpm add express zod` | `vitest` + `supertest` | `pnpm lint`, `pnpm tsc --noEmit` |
| `fastify` | `node-backend-specialist` | `pnpm dlx fastify-cli generate <dir> --lang=ts` | `vitest` / `node:test` + `app.inject` | `pnpm lint`, `pnpm tsc --noEmit` |
| `nestjs` | `node-backend-specialist` | `pnpm dlx @nestjs/cli new <dir>` | `jest` (Nest default) | `pnpm lint`, `pnpm tsc --noEmit` |
| `hono` | `node-backend-specialist` | `pnpm create hono@latest <dir>` | `vitest` + `app.request` | `pnpm lint`, `pnpm tsc --noEmit` |
| `fastapi` | `python-backend-specialist` | `uv init <dir> && uv add fastapi uvicorn pydantic-settings sqlalchemy alembic` | `pytest` + `httpx` | `uv run ruff check`, `uv run mypy .` |
| `django` | `python-backend-specialist` | `uv init <dir> && uv add django && uv run django-admin startproject config .` | `pytest` + `pytest-django` | `uv run ruff check`, `uv run mypy .` |
| `go` | `go-backend-specialist` | `go mod init <module>` | `go test ./...` | `golangci-lint run`, `go vet ./...` |
| `laravel` | `laravel-specialist` | `composer create-project laravel/laravel <dir>` | `php artisan test` (Pest) | `./vendor/bin/pint --test`, `./vendor/bin/phpstan analyse` |
| `rails` | `rails-specialist` | `rails new <dir> -d postgresql` | `bin/rails test` or `bundle exec rspec` | `bundle exec rubocop`, `bundle exec brakeman` |
| `supabase` | `baas-specialist` | `supabase init` (local stack: `supabase start`) | frontend runner + `supabase test db` (pgTAP) for RLS | as frontend |
| `firebase` | `baas-specialist` | `firebase init` | frontend runner + `@firebase/rules-unit-testing` on emulators | as frontend |

## Data (`stack.database`, `stack.orm`, `stack.cache_queue`, `stack.search`)

| Value | Specialist | Setup |
|---|---|---|
| `postgres` + `prisma` | `postgres-specialist` | `pnpm add -D prisma && pnpm prisma init` |
| `postgres` + `drizzle` | `postgres-specialist` | `pnpm add drizzle-orm postgres && pnpm add -D drizzle-kit` |
| `postgres` + `sqlalchemy` / `django-orm` / `gorm` / `eloquent` / `activerecord` | `postgres-specialist` + backend specialist | framework default |
| `mongodb` (+ `mongoose`) | `mongodb-specialist` | `pnpm add mongoose` |
| `supabase` / `firebase` | `baas-specialist` | via BaaS CLI |
| `redis`, `bullmq`, `celery`, `sidekiq` | `redis-queue-specialist` | Docker Compose `redis:7` locally |
| `meilisearch`, `typesense`, `algolia`, `elasticsearch` | `redis-queue-specialist` | Docker Compose service or hosted index |
| `pgvector` | `postgres-specialist` | `CREATE EXTENSION vector;` in a migration |

Local databases run in Docker Compose (`compose.yaml`) for dev and tests.

## Platform (`stack.hosting`)

| Value | Specialist | Config file |
|---|---|---|
| `vercel` | `hosting-platform-specialist` | `vercel.json` (optional) |
| `netlify` | `hosting-platform-specialist` | `netlify.toml` |
| `cloudflare` | `hosting-platform-specialist` | `wrangler.toml` / `wrangler.jsonc` |
| `fly` | `hosting-platform-specialist` | `fly.toml` + `Dockerfile` |
| `railway` | `hosting-platform-specialist` | `railway.json` / `Dockerfile` |
| `render` | `hosting-platform-specialist` | `render.yaml` |
| `aws`, `gcp`, `azure` | `cloud-infra-specialist` | `infra/` (Terraform/OpenTofu, CDK or Pulumi) |

## Integrations

| Key | Values | Agent |
|---|---|---|
| `stack.auth` | clerk, authjs, better-auth, lucia, supabase-auth, firebase-auth, custom | `auth-specialist` |
| `stack.payments` | stripe, paddle, lemonsqueezy | `payments-specialist` |
| `stack.cms` | sanity, payload, strapi, contentful | `cms-specialist` |
| `stack.ai` | anthropic, openai, multi | `ai-features-engineer` |
| `stack.realtime` | websockets, sse, supabase-realtime, pusher, liveblocks | `realtime-engineer` |
| `stack.email` | resend, postmark, sendgrid, ses | `email-specialist` |
| `stack.analytics` | posthog, plausible, ga4 | `analytics-engineer` |
| `stack.observability` | sentry, otel, datadog | `observability-engineer` |
| `stack.test_e2e` | playwright | `test-engineer` (`pnpm create playwright`) |

## Defaults by project type (used by `/setup-stack` as the recommendation)

| Type | Frontend | Backend | Data | Auth | Payments | CMS | Hosting |
|---|---|---|---|---|---|---|---|
| `saas` | nextjs | native | postgres + drizzle | better-auth or clerk | stripe | none | vercel |
| `marketing` | astro | none | none | none | none | sanity or payload | cloudflare or netlify |
| `ecommerce` | nextjs | native | postgres + drizzle | better-auth | stripe | sanity | vercel |
| `api` | none | hono (TS) or fastapi (Python) | postgres + drizzle / sqlalchemy | custom (API keys/JWT) | none | none | fly or railway |
| `mixed` | nextjs | native | postgres + drizzle | better-auth | stripe | payload | vercel |

## Known install pitfalls

- **npm `ERESOLVE` on fresh scaffolds** (peer ranges lag new React/Next majors):
  prefer `pnpm`, or install the missing peer explicitly. `--legacy-peer-deps`
  skips peers: with Vitest it leaves out `vite`, and the runner then fails at
  startup (`test-run.sh` reports `runner-error`). After such an install run
  `npm i -D vite`.
- **Framework agent docs**: `create-next-app` writes `AGENTS.md` and ships
  version-matched docs in `node_modules/next/dist/docs/`. Keep the file and
  import it from `CLAUDE.md` (`@AGENTS.md`).
