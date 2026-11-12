# Aux petits bonheurs - web app

## What this is

The ordering website of Aux petits bonheurs, a home bakery in Mauritius (EN/FR).
React Router (framework mode) on Cloudflare Workers, with Supabase (Postgres, Auth,
Storage), Drizzle ORM, Tailwind CSS + shadcn/ui. See
`../docs/architecture/adr/0001-stack.md` for why.

## Services and accounts

All accounts belong to the bakery and are opened with the bakery's email (NFR-012). MFA
(authenticator app or passkey, not SMS) is required on each (threat-model G-03, launch
blocker). The Owner fills in the last three columns when each account is created.

| Service | Used for | Owner email | MFA on: yes/date | Recovery codes kept in |
|---|---|---|---|---|
| Cloudflare | Workers (staging + production), Turnstile, Workers Logs | | | |
| Supabase | Postgres, Auth, Storage (one project per environment) | | | |
| GitHub | Code, CI, deploy workflow, weekly backups | | | |
| Resend | Transactional email | | | |
| Google | Bakery mailbox, Google Drive backups | | | |
| Sentry | Error tracking | | | |
| Domain registrar | Bakery domain (later; none at launch) | | | |

Keep recovery codes in the bakery password manager, never in this repository.

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

### Launch URLs

There is no custom domain at launch: both sites use the free `workers.dev` names.
`<subdomain>` is the Cloudflare account's workers.dev subdomain, chosen once (Cloudflare
dashboard → Workers & Pages → Overview, "Subdomain").

| Environment | Worker | URL |
|---|---|---|
| staging | `auxpetitsbonheurs-staging` | `https://auxpetitsbonheurs-staging.<subdomain>.workers.dev` |
| production | `auxpetitsbonheurs` | `https://auxpetitsbonheurs.<subdomain>.workers.dev` |

Staging answers every request with `X-Robots-Tag: noindex, nofollow`; production does not.

### How deploys happen

GitHub Actions runs `.github/workflows/deploy.yml` (ADR-0002):

1. Merge to `main`. The `ci` workflow runs; when it is green, the staging job applies
   pending migrations to the staging database, then runs `npm run deploy:staging`.
2. Try the change on staging. To release it, fast-forward the `production` branch to that
   exact commit (a non-fast-forward push is refused by git):

   ```sh
   git fetch origin
   git push origin <commit>:production
   ```

   The production job refuses a commit that has no successful staging deploy, applies
   pending migrations to the production database, then runs `npm run deploy:production`.
   "Run workflow" on the `production` branch (Actions tab) redeploys it.
3. Until the GitHub secrets exist (see "Secrets"), every deploy job is skipped with a notice
   and the workflow stays green.

Build and deploy commands (the workflow runs exactly these; they also work by hand with
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell):

```sh
CLOUDFLARE_ENV=staging npm run build       # build for staging
npm run deploy:staging                     # build + scripts/check-deploy.ts staging + wrangler deploy --env staging
CLOUDFLARE_ENV=production npm run build    # build for production
npm run deploy:production                  # build + scripts/check-deploy.ts production + wrangler deploy --env production
```

The environment is chosen at build time. `scripts/check-deploy.ts` refuses to ship a build
made for another environment (including the e2e build and the top-level development
config); a bare `wrangler deploy` only reaches the local-only Worker `auxpetitsbonheurs-local`,
which has no URL.

### Rollback

If a build, migration or check fails, the job stops before `wrangler deploy`, so the
previous version keeps running. To undo a bad release, redeploy the previous commit:
`git revert <bad commit>` on `main` (staging redeploys), then fast-forward `production` to
the revert. In an emergency, Cloudflare dashboard → Workers & Pages → the Worker →
Deployments → the previous version → Rollback; migrations are backward-compatible
(expand/contract), so the previous code runs on the newer schema.

### Worker CPU check (free plan, 10 ms)

How to measure CPU time per request on staging and record it in
`docs/architecture/cpu-measurements.md`: [`docs/runbooks/worker-cpu.md`](../docs/runbooks/worker-cpu.md)
(`npm run cpu:load`, `npm run cpu:report`).

### Supabase Auth redirect allowlist

Exact values, no wildcards (threat-model G-04). Supabase dashboard → the environment's
project → Authentication → URL Configuration:

| Environment | Site URL | Redirect URLs |
|---|---|---|
| staging | `https://auxpetitsbonheurs-staging.<subdomain>.workers.dev` | `https://auxpetitsbonheurs-staging.<subdomain>.workers.dev/auth/confirm` |
| production | `https://auxpetitsbonheurs.<subdomain>.workers.dev` | `https://auxpetitsbonheurs.<subdomain>.workers.dev/auth/confirm` |
| local | `http://localhost:5173` | `http://localhost:5173/auth/confirm` (Supabase CLI `config.toml` only) |

When the custom domain goes live, edit the production Site URL and Redirect URLs to `https://<bakery domain>` and `https://<bakery domain>/auth/confirm`, then remove the workers.dev entry.

### Database migrations

Migrations live in `drizzle/` (`0000_initial` = schema, `0001_launch_seed` = settings,
counter and Storage buckets). Generate with `npm run db:generate` and review the SQL. They
are applied to staging first, then production, before the deploy
that needs them: the deploy workflow runs `npm run db:migrate` with the environment's
`STAGING_DATABASE_URL` / `PRODUCTION_DATABASE_URL` (Supabase Session pooler, IPv4) before
each deploy. Merging to `main` or moving `production` is therefore the decision to migrate.
By hand (same connection strings, never committed):

```sh
DATABASE_URL='<staging session pooler URL>' npm run db:migrate
DATABASE_URL='<production session pooler URL>' npm run db:migrate
```

Tests use an in-process Postgres and never touch a real database.

### Launch checklist

- [ ] Replace the Juice number: `0001_launch_seed` stores the fake placeholder `5000 0000`.
      Set the real one in Settings (or `UPDATE settings SET juice_number = '…'`) on deploy day.
- [ ] Set the full pickup street address (seeded as "Beau Bassin" only).

## Secrets

Every key, where to find it and where to paste it: [`docs/runbooks/deploy-keys.md`](../docs/runbooks/deploy-keys.md).
No story runs these steps; the Owner does them (with the developer if wanted), once per
environment, in this order:

1. Owner, Cloudflare dashboard: create the bakery's Cloudflare account (MFA on) and choose
   the workers.dev subdomain.
2. Owner, Supabase dashboard: create the `staging` and `production` projects; set the Auth
   URL Configuration from "Deploy" above.
3. Owner, GitHub repo → Settings → Secrets and variables → Actions → Secrets: add
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `STAGING_DATABASE_URL`,
   `PRODUCTION_DATABASE_URL`; Variables: `STAGING_URL`, `PRODUCTION_URL`.
4. Owner: merge to `main` (or Actions → deploy → Run workflow on `main`): migrations run and
   the staging Worker is created. It shows an error page until step 5.
5. Owner, Cloudflare dashboard → Workers & Pages → `auxpetitsbonheurs-staging` → Settings →
   Variables and Secrets, each added as type Secret (or
   `npx wrangler secret put <NAME> --env staging|production`). **To start, only the four
   core secrets**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `DATABASE_URL`. The site runs with just these (ADR-0002 amendment).
   Later, one integration at a time: `RESEND_API_KEY` + `EMAIL_FROM` (email),
   `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (phone notifications),
   `SUPABASE_AUTH_HOOK_SECRET`, `TURNSTILE_SECRET_KEY`, `SENTRY_DSN`. While one is missing its
   feature is off and says so (hourly `integration_missing` line in Workers Logs; queued
   emails wait in the outbox). Each deploy run's summary lists what is still missing
   ("Launch readiness", names only). **Production must not be announced publicly before
   email and Turnstile are set.** The names and placeholders are in `.dev.vars.example`;
   CI needs none of them.
6. Owner: make your Owner account on staging without a computer: Supabase staging project →
   Authentication → Users → Add user → Create new user (your email, a strong password, Auto
   Confirm User on); then GitHub → Actions → **make-owner** → Run workflow (`staging`, the same
   email). It reads `STAGING_DATABASE_URL` / `PRODUCTION_DATABASE_URL`, is safe to re-run and
   fails with the fix when the user is missing or unconfirmed
   (`.github/workflows/make-owner.yml`). Or seed it from a computer (below).
7. Owner: repeat 4 to 6 for production (fast-forward `production`, Worker `auxpetitsbonheurs`,
   `--confirm-production`), then the launch checklist above.

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

### Real menu on staging (S-241)

GitHub → Actions → **seed-menu** → Run workflow (branch `main`) loads the Owner's cookies and
the six cake flavours from `app/db/menu-data.ts` (built from `docs/content/menu-source/`), with
their photos resized and uploaded to Storage. Insert-only by web address: a re-run reports
"already present" and never changes what the Owner edited. Cakes still at a placeholder price
are Rs 0 and hidden; the run prints "Prices to enter" and the missing content. It needs the
`STAGING_DATABASE_URL`, `STAGING_SUPABASE_URL` and `STAGING_SUPABASE_SERVICE_ROLE_KEY` secrets
(docs/runbooks/deploy-keys.md) and refuses any `APP_ENV` but `staging`. The unedited sample
cake becomes the real Chocolate Cake (same id).

## Backups

Weekly, every Sunday 02:00 Mauritius time (Saturday 22:00 UTC), and on demand (GitHub →
Actions → backup → Run workflow): `.github/workflows/backup.yml` dumps the **production**
database (`pg_dump --format=custom`), copies both Storage buckets (`public-images`,
`request-photos`) with `rclone`, encrypts everything with `age`, uploads one
`apb-backup-<date>.tar.age` file to the bakery's Google Drive folder and keeps the latest 8.
Nothing unencrypted leaves GitHub's runner.

Accounts involved (all the bakery's): GitHub (runs it, holds the secrets), Supabase
(production project: database and Storage), Google Drive (the backup folder), Resend
(the failure email to the bakery address). The `age` private key that decrypts backups
lives only in the bakery password manager: without it the backups are unreadable.

If a secret is missing the run fails at once naming it, and any failure emails
`BACKUP_NOTIFY_EMAIL` (GitHub also emails its own failure notice). Until the Owner sets the
secrets, the Sunday run fails on purpose: a backup is never silently skipped.

GitHub repository → Settings → Secrets and variables → Actions → Secrets (where to get each
value: `docs/runbooks/deploy-keys.md` section 5):

| Secret | What |
|---|---|
| `SUPABASE_DB_URL` | Production database, Session pooler connection string |
| `SUPABASE_S3_ENDPOINT` | Production Storage S3 endpoint |
| `SUPABASE_S3_REGION` | Production Storage S3 region |
| `SUPABASE_S3_ACCESS_KEY_ID` | Storage S3 access key id |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | Storage S3 secret access key |
| `AGE_RECIPIENT` | The `age1…` public key backups are encrypted to |
| `GDRIVE_TOKEN` | rclone's Google Drive token (JSON) |
| `GDRIVE_FOLDER_ID` | The Drive folder that holds the backups |
| `BACKUP_RESEND_API_KEY` | Resend key used only for the failure email |
| `BACKUP_NOTIFY_EMAIL` | The bakery address that gets the failure email |

Optional variable: `BACKUP_EMAIL_FROM` (defaults to Resend's test sender, which only
delivers to the Resend account's own address; set it once the bakery domain is verified).

Restore (new Supabase project → `pg_restore` → buckets back → secrets → redeploy) is
written and tested in E-12 as `docs/runbooks/restore.md`, once on staging before launch.

Supabase's free plan has no point-in-time recovery: the worst case is losing up to one week
of data (since the last Sunday backup). Orders also exist in the customer and admin emails.
This is accepted for v1 (architecture "Backups & restore").

The hourly `keepAlive` job (Cron Trigger) touches the database and Auth so the free projects
never pause, and `GET /healthz` answers `{ ok, db, auth }` (503 naming the failing part) for
an optional free uptime monitor.
