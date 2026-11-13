# Deploy keys: what to enter, and where

For the bakery Owner. Every key the code reads, where to get it, where to paste it, per
environment. Derived from `src/app/server/env.server.ts`, `src/wrangler.jsonc` and
`.github/workflows/*.yml`; tests (`src/app/lib/readme.test.ts`) fail if a key is missing here.

Rules: never paste a key into a chat, an email, a file in this repository or a `.env` file
that gets committed. Keep each value in the bakery password manager. Staging and production
use **different** values for everything except the Cloudflare token and account id.

Legend: **Secret** = hidden once saved. **Plain** = visible, not sensitive.

## 0. Before you start (once)

| What | Where | Note |
|---|---|---|
| Cloudflare account | dash.cloudflare.com, bakery email, MFA on | Workers & Pages → Overview: choose the workers.dev **subdomain** (written `<subdomain>` below) |
| Supabase projects | supabase.com, bakery email, MFA on | Create two projects, `apb-staging` and `apb-production`, regions as the Owner created them (2026-11-13): staging Northeast Asia (Seoul, `ap-northeast-2`), production Central EU (Frankfurt, `eu-central-1`). Save each **database password** in the password manager |
| Resend, Sentry, GitHub | bakery email, MFA on | Fill the README "Services and accounts" table as you go |

**Placement** is targeted at each Supabase region (`placement.region` in `src/wrangler.jsonc`,
ADR-0003 amendment 7): staging `aws:ap-northeast-2`, production `aws:eu-central-1`. If a project
is ever moved to another region, change that value in the same commit. **Hyperdrive** is optional, see section 6 (ADR-0003).

## 1. GitHub: repository → Settings → Secrets and variables → Actions

"Secrets" tab → **New repository secret**. Name exactly as written.

| Name | Kind | Staging / production | Where to get it |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Secret | one for both | Cloudflare → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** → Account Resources: Include the bakery account → Zone Resources: All zones → Continue → Create. Copy it now (shown once) |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | one for both | Cloudflare → Workers & Pages → Overview, right column **Account ID** |
| `STAGING_DATABASE_URL` | Secret | staging | Supabase staging project → **Connect** (top bar) → Connection string → Method **Session pooler** → URI. Replace `[YOUR-PASSWORD]` with the staging database password. Used only to apply migrations |
| `PRODUCTION_DATABASE_URL` | Secret | production | Same, in the production project |
| `STAGING_SUPABASE_URL` | Secret | staging | Supabase **staging** project → Project Settings → Data API → **Project URL**. Used only by the manual `seed-menu` workflow (S-241) |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Secret | staging | Supabase **staging** project → Project Settings → API Keys → **service_role** → Reveal. Used only by `seed-menu` to upload the menu photos. Full access to staging: never share |

"Variables" tab → **New repository variable** (optional, enables the after-deploy checks):

| Name | Kind | Value |
|---|---|---|
| `STAGING_URL` | Plain | `https://auxpetitsbonheurs-staging.<subdomain>.workers.dev` |
| `PRODUCTION_URL` | Plain | `https://auxpetitsbonheurs.<subdomain>.workers.dev` |

Why Session pooler: GitHub's machines have no IPv6 and Supabase's direct connection is
IPv6 only on the free plan.

Staging needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `STAGING_DATABASE_URL`;
production needs the two Cloudflare secrets and `PRODUCTION_DATABASE_URL`. While none of an
environment's secrets exist, the deploy workflow says "Deploy skipped ... not configured
yet" and stays green. If only some exist, it fails and names the missing ones.

GitHub **Environments** (Settings -> Environments): the workflow deploys into `staging` and
`production`, which GitHub creates on the first run. Before the first production deploy open
`production` and set **Required reviewers** (the Owner) and **Deployment branches: Selected
branches -> `production`**, so nothing reaches production without a deliberate approval.

## 2. Cloudflare: Workers & Pages → `<worker>` → Settings → Variables and Secrets

The Workers exist after the first deploy (step 4 of the order below): `auxpetitsbonheurs-staging`
for staging, `auxpetitsbonheurs` for production. For each name: **+ Add** → Type **Secret**
→ name → value → Deploy. Add every one as type **Secret**, even the non-sensitive ones: a
"Text" variable added in the dashboard is removed by the next deploy, a Secret is kept.
(Same thing from a terminal: `npx wrangler secret put <NAME> --env staging|production`.)

**Start with the first four rows only** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`): the site starts with just these. Every other row
is an optional integration you can add later, one at a time; until it is set its feature is
off and says so (an hourly `integration_missing` line in Workers Logs; queued emails wait in
the outbox and go out once email is configured, from E-10). After each deploy the GitHub run
summary shows **Launch readiness**: the names still missing (never values).
**Before production is announced publicly**, email (`RESEND_API_KEY`, `EMAIL_FROM`) and
`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` must be set: the production summary says "NOT ready for public
launch" until they are.

| Name | Sensitive | Value for staging / production | Where to get it |
|---|---|---|---|
| `SUPABASE_URL` | no | each project's own | Supabase project → Project Settings → Data API → **Project URL** (`https://<ref>.supabase.co`; must be https) |
| `SUPABASE_ANON_KEY` | low (public) | each project's own | Project Settings → API Keys → **anon public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | **high** | each project's own | Project Settings → API Keys → **service_role** → Reveal. Full database access: never share |
| `DATABASE_URL` | **high** | each project's own | Project → **Connect** → Method **Transaction pooler** (port 6543) → URI, with the database password. This one is for the running site (not the Session pooler URL used by GitHub) |
| `RESEND_API_KEY` | **high** | one key per environment | resend.com → API Keys → Create API Key → Permission **Sending access** → copy (shown once) |
| `EMAIL_FROM` | no | staging: `Aux petits bonheurs <onboarding@resend.dev>`; production: see note | Note: the free `workers.dev` address cannot be verified in Resend (you do not own its DNS). Until the bakery domain exists, use Resend's test sender `onboarding@resend.dev`, which only delivers to the Resend account's own email address: fine for staging, **not** for customers. Before launch, verify `mail.<bakery domain>` in Resend → Domains and set `Aux petits bonheurs <orders@mail.<bakery domain>>` (launch blocker G-03) |
| `SITE_URL` | no | staging: the Worker's `workers.dev` address; production: `https://<bakery domain>` | The origin every email link starts with (cron has no request to read it from). Origin only, no path. Email stays off until it, `RESEND_API_KEY` and `EMAIL_FROM` are all set (section 3b) |
| `VAPID_PUBLIC_KEY` | no | one pair per environment | On your computer: `npx web-push generate-vapid-keys` → "Public Key" |
| `VAPID_PRIVATE_KEY` | **high** | same pair as above | Same command → "Private Key" |
| `VAPID_SUBJECT` | no | both: `mailto:<bakery address>` | The bakery email address |
| `SUPABASE_AUTH_HOOK_SECRET` | **high** | each project's own | Supabase project → Authentication → Hooks → Add hook → **Send Email hook** → type HTTPS → URL `https://<worker URL>/hooks/supabase/send-email` → **Generate secret** → copy (`v1,whsec_…`). The route exists since S-024 (2026-11-12): **enable** the hook only after `RESEND_API_KEY` and `EMAIL_FROM` are set for that Worker, else reset emails fail (the forgot page still shows its calm message). It sends password reset emails in the admin's language; while disabled, Supabase sends its own English email whose link does not work with the admin reset page |
| `TURNSTILE_SITE_KEY` | no (public) | one widget per environment | Cloudflare → Turnstile → Add widget → name `apb-staging` / `apb-production` → Hostname: the Worker's `workers.dev` host → Widget mode **Non-interactive** (no puzzles, E-08 S-162 AC7) → Create → copy **Site key**. The custom cake form shows the widget only when both Turnstile keys are set |
| `TURNSTILE_SECRET_KEY` | **high** | same widget as above | Same widget → copy **Secret key** |
| `SENTRY_DSN` | low | one project, same DSN in both (or one project per environment) | sentry.io → Projects → Create project → platform **Cloudflare Workers** → Settings → Projects → the project → **Client Keys (DSN)** → copy the DSN (`https://…@o….ingest.sentry.io/…`) |

Set in `src/wrangler.jsonc`, **do not** add in the dashboard: `APP_ENV`
(`staging` / `production`) and `APP_TIME_ZONE` (`Indian/Mauritius`).
Never set `TEST_CLOCK` anywhere but local tests: staging and production refuse to start with it.

A missing or malformed value makes the site answer with an error naming the variable
(never its value); fix it here and the next request picks it up.

## 3. Supabase: Authentication settings (each project)

Authentication → URL Configuration. Exact values, no wildcards:

| Project | Site URL | Redirect URLs |
|---|---|---|
| staging | `https://auxpetitsbonheurs-staging.<subdomain>.workers.dev` | `https://auxpetitsbonheurs-staging.<subdomain>.workers.dev/auth/confirm` |
| production | `https://auxpetitsbonheurs.<subdomain>.workers.dev` | `https://auxpetitsbonheurs.<subdomain>.workers.dev/auth/confirm` |

When the bakery domain goes live, change the production values to `https://<bakery domain>`
and `https://<bakery domain>/auth/confirm`, then delete the workers.dev entry.

Authentication → Sign In / Providers → Email: keep **Confirm email** on.

## 3b. Email: when the bakery domain is bought (E-10)

Until then **nothing is sent**: orders queue their emails, the hourly job logs
`not sent: email not set up`, and every order still works. Settings → Email usage shows the
daily count (free limit 100). Do these once per environment, in this order.

1. Resend: resend.com → sign up (free plan) → Domains → **Add Domain** → `mail.<bakery domain>` → region closest to Mauritius' customers (any).
2. At the domain registrar (DNS): add each record Resend lists (SPF `TXT`, DKIM `CNAME`/`TXT`, MX for the `send` sub-name). Add a DMARC `TXT` on `_dmarc.<bakery domain>`: `v=DMARC1; p=none; rua=mailto:<bakery address>`.
3. Resend → Domains → **Verify DNS Records**; wait for "Verified" (minutes to a few hours).
4. Resend → API Keys → **Create API Key** → name `apb-staging` or `apb-production` → Permission **Sending access** → Domain `mail.<bakery domain>` → copy the key (shown once).
5. Cloudflare → Workers & Pages → the Worker → Settings → Variables and Secrets → **+ Add**, type **Secret**, one per line:
   - `RESEND_API_KEY` = the key
   - `EMAIL_FROM` = `Aux petits bonheurs <orders@mail.<bakery domain>>`
   - `SITE_URL` = `https://<bakery domain>` (origin only, no path)
6. Deploy (or wait for the next deploy): the next hourly tick sends everything that was queued.
7. Supabase auth emails (pick **A**, the one this app is built for):
   - A. Supabase → Authentication → Hooks → **Send Email hook** → HTTPS → URL `https://<bakery domain>/hooks/supabase/send-email` → **Generate secret** → copy `v1,whsec_…` → Cloudflare Secret `SUPABASE_AUTH_HOOK_SECRET` (same screen as step 5) → deploy → back in Supabase set the hook **Enabled**. Do not enable it before step 5 is deployed.
   - B. (only if A is not wanted) Supabase → Project Settings → Authentication → SMTP Settings → host `smtp.resend.com`, port `465`, user `resend`, password = the Resend key, sender `orders@mail.<bakery domain>`. Supabase then sends its own English emails.
8. Test: Team → invite a test address you own; place a test order with your own address; check the email and Settings → Email usage.

GitHub Actions never needs these keys (they are Worker secrets). Rollback: empty
`RESEND_API_KEY`; rows stay queued and send after it is restored.

## 4. Order of the one-time steps

Staging first, then production.

1. Section 0: accounts with MFA, workers.dev subdomain, both Supabase projects.
2. Section 3 for both projects.
3. Section 1: the four GitHub secrets (and the two variables).
4. Staging: merge to `main` (or Actions → **deploy** → Run workflow on `main`). The workflow
   applies the migrations to the staging database, then creates the `auxpetitsbonheurs-staging`
   Worker. It shows an error page until step 5.
5. Section 2 for `auxpetitsbonheurs-staging`: the four core secrets, staging values (the
   integrations can wait).
6. Open `https://auxpetitsbonheurs-staging.<subdomain>.workers.dev/healthz`: expect `"ok":true`.
7. Make the Owner's account on staging, no computer needed:
   a. Supabase **staging** project → Authentication → Users → **Add user** → **Create new
      user**: your email, a strong password (keep it in the password manager), **Auto Confirm
      User** on → Create user.
   b. GitHub → Actions → **make-owner** → Run workflow: environment `staging`, the same email
      (name optional) → Run. Green = you are the Owner; sign in at `/admin` with that email and
      password. Re-running is safe. A red run says what to fix (no such user, or not confirmed).
   (Alternative from a computer: README "Seeding the first Owner", `npm run seed:owner`.)
   Optionally `npm run seed:sample`.
8. Production: fast-forward the `production` branch to a commit staging runs
   (`git push origin <commit>:production`). The workflow checks staging, migrates the
   production database and creates the `auxpetitsbonheurs` Worker.
9. Section 2 for `auxpetitsbonheurs`: the four core secrets, production values. Add email and
   Turnstile before the public launch (the deploy summary lists what is missing).
10. The production Owner: step 7 in the Supabase **production** project, then **make-owner**
    with environment `production` (GitHub asks the `production` required reviewer to approve).
    (Alternative from a computer: `npm run seed:owner -- --confirm-production`.)
11. **Deploy day**: the Owner signs in to the site's admin → **More → Settings**:
    in **Payment**, the Juice account name, the Juice number (seeded as the fake `5000 0000`)
    and the WhatsApp for payment proof (customers pay in full by Juice at order; until the
    name and number are set they read "We'll send you the payment details on WhatsApp");
    in **Delivery and pickup**, the full pickup address (seeded as "Beau Bassin" only). Save.
12. Weekly backups: section 5.

## 5. Backups: GitHub repository → Settings → Secrets and variables → Actions

Weekly backup of **production** (`.github/workflows/backup.yml`, README "Backups"). All are
repository **Secrets** except `BACKUP_EMAIL_FROM` (a Variable). Production values only.
Until all eight required secrets exist, the Sunday run fails and says which are missing.

| Name | Kind | Where to get it |
|---|---|---|
| `SUPABASE_DB_URL` | Secret | Production project → **Connect** → Method **Session pooler** → URI with the database password (same value as `PRODUCTION_DATABASE_URL`; kept separate so backups can later use a read-only role) |
| `SUPABASE_S3_ENDPOINT` | Secret | Production project → Project Settings → Storage → **S3 Connection**: enable "S3 protocol connection", copy **Endpoint** (`https://<ref>.storage.supabase.co/storage/v1/s3`) |
| `SUPABASE_S3_REGION` | Secret | Same panel → **Region** (production: `eu-central-1`) |
| `SUPABASE_S3_ACCESS_KEY_ID` | Secret | Same panel → S3 Access Keys → **New access key** (description "weekly backup") → Access key ID |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | Secret | Same new key → Secret access key (shown once) |
| `AGE_RECIPIENT` | Secret | On your computer: install `age`, run `age-keygen -o apb-backup.key`. It prints `Public key: age1…`: that line's `age1…` value goes here. Put the whole `apb-backup.key` file in the bakery password manager, then delete it from the computer. It is the only way to read the backups |
| `GDRIVE_TOKEN` | Secret | On your computer: install `rclone`, run `rclone authorize "drive"`, sign in with the bakery Google account in the browser, copy the JSON it prints (`{"access_token":…}`) |
| `GDRIVE_FOLDER_ID` | Secret | Google Drive (bakery account) → New folder "APB backups" → open it → the id is the last part of the address (`drive.google.com/drive/folders/<id>`) |
| `BACKUP_RESEND_API_KEY` | Secret | Resend → API Keys → Create API Key "backup alerts", Sending access |
| `BACKUP_NOTIFY_EMAIL` | Secret | The bakery email address (with Resend's test sender it must be the Resend account's own address) |
| `BACKUP_EMAIL_FROM` | Variable (optional) | After the bakery domain is verified in Resend: `Aux petits bonheurs <alerts@mail.<bakery domain>>` |

Then GitHub → Actions → **backup** → Run workflow once, and check that an
`apb-backup-<date>.tar.age` file appears in the Drive folder.

## 6. Hyperdrive (optional, speeds up database access; ADR-0003)

Per environment, staging first:

1. Supabase project -> **Connect** -> **Direct connection** -> URI with the database password.
   If Cloudflare cannot connect (Supabase direct is IPv6 only), use **Session pooler**
   (port 5432) instead. Not the Transaction pooler.
2. Cloudflare -> Storage & Databases -> **Hyperdrive** -> Create configuration: name
   `apb-staging` (or `apb-production`), paste that URI. Check the free-plan limits shown there.
3. Copy the configuration's **ID** (not a secret). GitHub -> Settings -> Secrets and variables
   -> Actions -> **Variables** -> `STAGING_HYPERDRIVE_ID` (later `PRODUCTION_HYPERDRIVE_ID`).
4. Staging: automatic deploys do **not** bind Hyperdrive (ADR-0003 amendment: parameterised
   queries timed out through it). To re-test, Actions -> **deploy** -> Run workflow on `main`
   with **hyperdrive** ticked, then run **cpu-measure**. Production binds it whenever
   `PRODUCTION_HYPERDRIVE_ID` is set, so leave that empty. Keep `DATABASE_URL` set.

Rollback: delete the variable's value and redeploy.
