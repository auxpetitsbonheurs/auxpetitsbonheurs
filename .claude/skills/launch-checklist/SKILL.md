---
name: launch-checklist
description: "Runs the first-launch checklist with release-manager: legal pages, analytics and consent, monitoring and alerts, backups, DNS/TLS, error pages, metadata and OG images, favicon and manifest, email deliverability, and the audits the rigor level requires, ending in a go/no-go summary. Use when preparing to launch a site or app publicly for the first time."
argument-hint: "[target date]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(curl -sI *), Bash(dig *)
model: sonnet
---

# Launch Checklist

Collects evidence that the product is ready for its first public launch and
writes `production/releases/launch/checklist.md`. It ends with a go/no-go
summary; the user decides. It never deploys, flips DNS, or announces anything.

## Inputs

- `project.yaml`: `project.type`, `modes.rigor`, `privacy.regions`, `stack.*`, budgets
- Audit reports in `production/audits/` (latest of each type)
- `production/releases/runbook.md`, CI config, PRD launch criteria
- The production or final preview URL (ask)

## Phases

### Phase 1: Audits

Required audits by rigor (from `.claude/docs/config-resolution.md`):
`minimal` → perf + security; `standard` → perf, a11y, security, seo; `full` →
all six (+ deps, privacy). For each: latest report date, open Critical/High
count. Missing or older than 14 days → offer to run it (`/team-launch` runs
them in parallel). Open Critical findings are a no-go.

### Phase 2: Checklist

Spawn `release-manager` to verify each item with evidence (file path, URL
response, or the user's confirmation). Mark ✅ / ❌ / N/A:

**Product and content**: critical journeys pass in Playwright (`/smoke-check`);
custom 404 and 500 pages; no lorem ipsum or placeholder images (Grep);
pricing and claims confirmed by the user.

**Legal and privacy**: privacy policy, cookie policy, terms (drafts reviewed by
the user's counsel); consent banner if `privacy.regions` needs it; imprint/legal
notice where required; account deletion works.

**SEO and sharing** (not `api`): titles/descriptions, canonical, `sitemap.xml`,
`robots.txt` allows production and blocks previews, OG image 1200×630,
favicon set + `apple-touch-icon` + web manifest, structured data.

**Infrastructure**: DNS for apex and www, TLS valid (`curl -sI`), HSTS,
redirects, environment variables set in production, production database with
automated backups and one tested restore, migrations applied, cron/workers
running, rate limits on, CDN caching headers.

**Observability**: error tracking with source maps and release tags, uptime
checks on home + health endpoint, alerts routed to the user, logs retained.

**Email** (if `stack.email`): SPF, DKIM, DMARC on the sending domain (`dig TXT`),
transactional templates tested in an inbox capture, from-address and reply-to set.

**Payments** (if `stack.payments`): live mode keys set by the user in the host
(never in the repo), webhooks registered for production, a real low-value
purchase and refund done by the user, tax settings confirmed.

**Analytics**: tracking plan events firing in production, internal traffic excluded.

**Rollback**: runbook exists; the user knows the rollback command.

### Phase 3: Go/no-go

Summarise: blockers (❌ on a required item or open Critical findings), risks
(High findings, N/A items worth a second look), and what is ready. Recommend
`GO` or `NO-GO` with reasons; the user decides.

### Phase 4: Write

Ask "May I write this to `production/releases/launch/checklist.md`?" using the
`launch-checklist` template.

## Output

`production/releases/launch/checklist.md` (template: `.claude/docs/templates/launch-checklist.md`).

## Rigor

- `minimal`: blockers only (TLS, backups, legal pages, perf + security audits, rollback).
- `standard`: the full checklist.
- `full`: full checklist + director sign-off via `/gate-check launch`.

## Next step

`/gate-check launch`, then after launch `/smoke-check` against production and `/release-notes`.
