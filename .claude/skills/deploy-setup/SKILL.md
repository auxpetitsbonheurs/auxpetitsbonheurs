---
name: deploy-setup
description: "Configures deployment for the chosen host (Vercel, Netlify, Cloudflare, Fly.io, Railway, Render, AWS, GCP, Azure): config files, environments and preview deploys, env var inventory, domains and TLS, migration step, health checks and a rollback runbook. Use when preparing the first deploy, adding environments, or switching hosts. Prints deploy commands; never runs production deploys."
argument-hint: "[host]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Deploy Setup

Makes deploys repeatable and reversible. It writes host config and a runbook
after approval and **prints** every command that touches a real environment
for the user to run. It never deploys to production, applies Terraform, buys
domains, changes plans or sets secret values.

## Inputs

- `project.yaml`: `stack.hosting`, `stack.frontend`, `stack.backend`, `stack.database`, `stack.cache_queue`
- `docs/architecture/architecture.md` (deployment topology) and hosting ADRs
- `.env.example` (the variable inventory)
- `.claude/docs/stack-matrix.md` (build/start commands, output dirs, adapters)

If `stack.hosting` is empty, spawn `technical-director` to recommend one (cost
at launch traffic, runtime fit, lock-in) and ask the user; record the choice
with `/architecture-decision`.

## Phases

### Phase 1: Topology

Confirm what runs where: web app, API, workers/cron, database, cache, object
storage, email, CDN. Delegate:
- Vercel, Netlify, Cloudflare, Fly.io, Railway, Render → `hosting-platform-specialist`
- AWS, GCP, Azure → `cloud-infra-specialist` (Terraform/OpenTofu/CDK/Pulumi)

If `vercel` is the host and `deploy-to-vercel` (vercel-labs/agent-skills) is
installed, use it for the platform specifics; otherwise say so and continue.

### Phase 2: Config files

Draft the host config (`vercel.json`, `netlify.toml`, `wrangler.toml`,
`fly.toml`, `railway.json`, `render.yaml`, a multi-stage non-root
`Dockerfile` + `.dockerignore`, or IaC modules under `infra/`), framework
adapters (SvelteKit/Astro/Remix/Nuxt preset), and a health endpoint
(`/api/health`) that checks the DB without leaking details.

### Phase 3: Environments and variables

Table: variable → purpose → preview value source → production value source →
public or secret. Every secret lives in the host's secret store. Preview
deployments use a separate database/branch (Neon/Supabase branching or a
staging DB) and test-mode payment keys. Previews are protected or `noindex`.

### Phase 4: Release mechanics

- Migrations run as an explicit release step (before traffic switches), never at app boot on multiple instances; expand → migrate → contract for breaking changes.
- Health checks and zero-downtime strategy appropriate to the host.
- Domains: apex + www redirect, TLS, HSTS once stable.
- Cron/workers: the host's scheduler, with a lock.

### Phase 5: Runbook

Write `production/releases/runbook.md` (template `runbook`): deploy steps,
the exact commands, how to roll back (instant rollback on the platform,
previous image tag, or `git revert` + redeploy), how to roll back a migration,
how to restore the latest backup, and who to call.

### Phase 6: Approve and hand off

Show the files. Ask "May I write these files?" (list them). Then print the
one-time setup commands (link project, set env vars, add domain) for the user
to run.

## Output

Host config files, `infra/` (if IaC), `production/releases/runbook.md` (template: `.claude/docs/templates/runbook.md`).

## Rigor

- `minimal`: production + previews, runbook with rollback.
- `standard`: + separate preview database, health checks, migration step.
- `full`: + IaC for every environment, backup restore test, cost estimate per environment.

## Next step

`/observability-setup`, then `/launch-checklist`.
