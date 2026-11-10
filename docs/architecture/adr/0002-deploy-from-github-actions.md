# ADR-0002: Deploy from GitHub Actions instead of Workers Builds

Status: accepted (supersedes the "Workers Builds for auto-deploy" part of ADR-0001 only)
Date: 2026-11-10 · Deciders: devops-lead, hosting-platform-specialist (automation mode `auto`, user instructed "decide, do not ask"); for owner review

## Context
ADR-0001 chose Cloudflare Workers Builds (Cloudflare builds and deploys on each git push).
S-002 also needs: migrations applied **before** the deploy that needs them (architecture
"Environments"), production released only when staging already runs the same commit, a
check that the build was made for its environment (tech debt: a lax top-level or e2e
build could ship), and a pipeline that stays green until the bakery's keys exist.

## Options considered
### Option A: GitHub Actions `deploy.yml` (chosen)
- Pros: runs after `ci` passes, applies migrations then `npm run deploy:<env>` in one job,
  checks the staging deployment of the commit before production, skips with a notice while
  secrets are missing; one place (GitHub) for the deploy and backup secrets; free for the
  bakery's repo.
- Cons: two GitHub secrets give deploy rights (Cloudflare API token, account id), plus the
  two database URLs for migrations.
### Option B: Workers Builds (ADR-0001)
- Pros: no Cloudflare token in GitHub.
- Cons: build runs in Cloudflare's builder without a natural place for the migration step
  and the database URL; no "staging already runs this commit" check; failures surface in
  the Cloudflare dashboard, away from CI.

## Decision
Deploy with `.github/workflows/deploy.yml`: staging after `ci` is green on `main`;
production on a fast-forward of the `production` branch to a commit with a successful
staging deployment. Workers Builds is not connected.

## Consequences
- Secrets: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers"), `CLOUDFLARE_ACCOUNT_ID`,
  `STAGING_DATABASE_URL`, `PRODUCTION_DATABASE_URL` in GitHub Actions; Worker runtime secrets
  stay in Cloudflare (`docs/runbooks/deploy-keys.md`).
- Migrations run from GitHub runners (IPv4), so the database URLs are Supabase **Session
  pooler** strings, not the IPv6-only direct connection.

## Revisit when
The bakery's repository moves off GitHub, or Cloudflare's builder gains a pre-deploy step
with secret access that makes Option B equivalent.
