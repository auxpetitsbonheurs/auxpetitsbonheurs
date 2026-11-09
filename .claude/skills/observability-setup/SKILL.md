---
name: observability-setup
description: "Sets up error tracking, structured logging, metrics/tracing, uptime checks and alerts for the configured stack (Sentry, OpenTelemetry, Datadog or host-native), plus an incident runbook. Use before launch, when production errors are invisible, or when alerts are noisy."
argument-hint: "[errors | logs | uptime | alerts | all]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Observability Setup

Plans and implements observability through `observability-engineer`, and
writes the runbook to `docs/architecture/runbook.md` (template
`.claude/docs/templates/runbook.md`). Code changes follow the normal
ask-before-writing flow. It never creates accounts, API keys or paid
monitors itself: it lists what the user must create and the env var names
to put in `.env.example`.

## Inputs

- `project.yaml`: `stack.observability`, `stack.hosting`, `stack.frontend`, `stack.backend`, `privacy.regions`
- `docs/architecture/architecture.md` (services, critical dependencies)
- `docs/product/prd.md` critical journeys

## Phases

### Phase 1: Choose tools

If `stack.observability` is unset, ask:
`Sentry (Recommended: errors + performance, client and server)`,
`OpenTelemetry + a backend of choice (Grafana, Honeycomb, Axiom)`,
`Datadog`, `Host-native only (Vercel/Cloudflare/Fly logs)`.

### Phase 2: Plan

Spawn `observability-engineer` with the architecture and stack. The plan covers:

| Area | Setup |
|---|---|
| Errors | SDK on client and server; release + environment tags; source maps uploaded in CI (not served publicly); PII scrubbing (`sendDefaultPii: false`, beforeSend filters) |
| Logs | Structured JSON (pino / structlog / slog / Monolog); request ID propagated; levels; no secrets, tokens or bodies with PII |
| Traces/metrics | OTel or SDK performance on key routes; RED metrics (rate, errors, duration) for critical endpoints |
| Health | `/api/health` (liveness) and a readiness check that verifies DB/cache without leaking internals |
| Uptime | Synthetic checks on home, login, the core journey's API and the payment webhook endpoint |
| Alerts | On symptoms users feel: error-rate spike, p95 latency over budget, uptime failure, payment webhook failures, queue backlog. Each with threshold rationale, owner (the user) and a runbook link |

Ask the user to confirm thresholds and the alert channel (email, Slack, phone).

### Phase 3: Implement

Delegate to `observability-engineer` (and the stack specialist for
framework hooks, e.g. Next.js instrumentation, Nuxt/Nitro plugin, Django
middleware). Show the file list and ask before writing. Add the required env
var names to `.env.example`.

### Phase 4: Runbook

Draft `docs/architecture/runbook.md`: how to read the dashboards, the top
failure modes and their first response, rollback steps per host, who to
contact (vendors' status pages), and the `/incident` entry point. Ask before writing.

### Phase 5: Verify

Ask the user to trigger a test error in a non-production environment and
confirm it arrives with a readable stack trace and no PII.

## Output

Code changes (approved), `.env.example` additions, `docs/architecture/runbook.md`.

## Next step

`/launch-checklist`, or `/incident` when something breaks.
