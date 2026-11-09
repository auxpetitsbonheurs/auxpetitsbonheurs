---
name: incident
description: "Runs a live production incident: severity, impact, a timestamped timeline, diagnosis, and mitigation options that the user approves one by one; then hands off to /hotfix and /postmortem. Use when the site is down, erroring, slow, leaking data, or payments are failing."
argument-hint: "<what is happening>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git log*), Bash(git diff*)
model: opus
---

# Incident

Coordinates a production incident and keeps the record in
`production/incidents/YYYY-MM-DD-<slug>.md` (template
`.claude/docs/templates/incident-report.md`). Calm, short messages. **Every
action that touches production (rollback, redeploy, flag flip, config
change, data fix) is proposed with its command and waits for the user's
explicit yes**; the skill never runs it.

## Inputs

- The user's description (argument), error messages, alerts, screenshots
- `docs/architecture/runbook.md`, `docs/architecture/architecture.md`
- Recent changes: `git log --since=48.hours`, `production/releases/`
- `project.yaml`: `stack.hosting`, `stack.observability`

## Phases

### Phase 1: Triage (first reply, within a few lines)

Ask only what is needed to set severity:

| Sev | Meaning | Example |
|---|---|---|
| SEV1 | Site down, data loss/leak, payments broken for all | 5xx on every page; secret exposed |
| SEV2 | Core journey broken for many; major degradation | login fails on mobile; checkout errors 20% |
| SEV3 | Partial or workaround exists | one integration failing; slow admin page |

Create the incident file with severity, start time (UTC), symptoms and
impact. Writing the incident file needs no approval; say you created it.
**Data leak or exposed secret:** first step is to rotate/revoke the
credential at the provider (the user does it), then continue.

### Phase 2: Diagnose (parallel)

Spawn:
- `observability-engineer`: read the errors/logs the user pastes; find the first bad signal and its time
- `lead-backend` or `lead-frontend` (whichever side the symptoms point to): correlate with recent commits and releases
- `security-lead` if it may be a security incident; `payments-specialist` if payments are involved

Collect hypotheses ranked by evidence. Update the timeline with each finding.

### Phase 3: Mitigate

Offer options, fastest-to-safety first, each with the exact command or
dashboard step, its risk and how to verify it:
1. Roll back to the last good deploy (host-specific: e.g. Vercel instant rollback, `fly releases` + rollback, Render rollback)
2. Disable the feature flag / kill switch
3. Scale or restart the failing component
4. Forward fix (→ `/hotfix`), only if rollback is impossible or riskier

Wait for the user's choice. After they act, ask them to confirm the
verification signal, and log it with a timestamp.

### Phase 4: Communicate

Draft a status update (internal and customer-facing if needed): what is
affected, what we are doing, next update time. The user posts it.

### Phase 5: Resolve

When the user confirms recovery, record the end time, duration, impact
(users, revenue, data) and the root-cause hypothesis. Set `Status: mitigated`
or `resolved`.

## Output

`production/incidents/YYYY-MM-DD-<slug>.md`; drafted status messages.

## Next step

`/hotfix` if a code fix is still needed; `/postmortem` for every SEV1/SEV2 (recommended for SEV3).
