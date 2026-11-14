# Staging and live pipeline review (S-235) — 2026-11-14

Owner: launchprep job (hosting-platform-specialist role). Read from `.github/workflows/*.yml`,
the README "Deploy" section, GitHub Actions run history and the staging site. Nothing was deployed
to production and no migration was run by this job.

| AC | State | Evidence and notes |
|---|---|---|
| AC1 main → tests → staging automatically; live by explicit promotion; a failing test blocks both | **Built; fixed a starvation problem** | `deploy.yml`: staging runs only after a green `ci` on a push to main; production only when the `production` branch is fast-forwarded (or "Run workflow" on it) and only for a commit staging already runs. **Finding PIPE-01 (fixed):** `ci.yml` cancelled the running CI on every push to main, so with several jobs pushing no run finished: the last staging deploy was 2026-11-13 15:13 (3693222), about 30 commits behind. CI on main now runs to completion (newest queued run kept); branches still cancel. The `production` branch does not exist yet: no live deploy has ever run |
| AC2 separate database, storage, Resend domain, Turnstile, VAPID, hook secret per environment | **Partly** | Staging: own Supabase project, Worker `auxpetitsbonheurs-staging`, staging secrets in the `staging` GitHub environment. Production: secrets not created yet (`production-preflight` would skip). Resend allows one domain per free team: staging uses the test sender (`docs/runbooks/free-plans.md`). Owner steps: `docs/runbooks/deploy-keys.md` |
| AC3 staging emails only to test inboxes; not indexed | **Pass** | Staging sends from `onboarding@resend.dev`, which only delivers to the Resend account's own address. Every staging response has `X-Robots-Tag: noindex, nofollow` (checked by the deploy smoke step and `workers/headers.test.ts`; Lighthouse `is-crawlable` fails on staging as intended) |
| AC4 rollback documented and tried on staging | **Documented, not tried** | README "Rollback": `git revert` + redeploy, or Cloudflare → Workers & Pages → the Worker → Deployments → previous version → Rollback (migrations are expand/contract). Trying it needs the Cloudflare dashboard or a token in a shell: Owner or builder, 5 minutes, then note the time here |
| AC5 Sentry on live with release, request ID, no PII; alert; test error | **Not built** | `SENTRY_DSN` exists as an optional key and launch readiness lists it, but the Worker sends nothing to Sentry: errors are only in Cloudflare Workers Logs (structured, redacted by `workers/log-redact.ts`). Needs a story: report unhandled errors with release and request ID, then a deliberate test error |
| AC6 `/healthz` 200 on live; uptime check with alert | **Endpoint pass; uptime check not set up** | Staging `/healthz` → `{"ok":true,"db":"ok","auth":"ok"}`; the production deploy step curls it. An external free uptime check (e.g. a free monitor service, every 5 minutes, email on failure) is an Owner account step |
| AC7 migrations forward-only, live only on instruction after staging | **Pass** | Migrations run in the deploy job before the Worker deploy: staging on merge to main, production only when the Owner moves `production`. Drizzle migrations are forward-only; no agent runs them against live |

## Other observations

- CI on main also failed on 13cf1b0 (unit tests): a `cn` reference test (fixed upstream in 92c4836)
  and this job's a11y spec using `test.setTimeout`, which the "no fixed sleeps" check forbids
  (fixed in eed4de2). Watch the next green run reach staging.
- `secret-scan` flagged a test idempotency key; the security job allow-listed it (3cd1a2c).
- Hyperdrive is on for staging deploys (`vars.STAGING_HYPERDRIVE_ID`); production uses it only if
  `PRODUCTION_HYPERDRIVE_ID` is set.
- The weekly backup is a scheduled workflow: GitHub disables schedules in a public repository after
  60 days without a commit (monthly check in `docs/runbooks/free-plans.md`).

## First production deploy (for the deploy-day checklist)

1. Owner: production secrets and variables exist (deploy-keys.md sections 1-3) and launch readiness
   shows no missing core secret.
2. Builder or Owner, on a computer: `git fetch origin && git push origin <a commit staging runs>:production`.
   The `production` job checks staging ran that commit, applies the migrations to the production
   database, deploys, prints launch readiness and curls `/healthz`.
3. GitHub → Actions → make-owner → Run workflow (`production`, the Owner's email) after creating the
   Owner's Auth user in the production Supabase project (README "Secrets" step 6).
4. Continue with `production/releases/launch-checklist.md`.
