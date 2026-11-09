---
name: team-launch
description: "Orchestrates the launch: release-manager runs the launch audits in parallel (performance, accessibility, security, dependencies, SEO, privacy) plus QA, collects verdicts including QA-RELEASE and SEC-LAUNCH, and presents a go/no-go summary before the launch checklist. Use when preparing a first launch or a major release."
argument-hint: "[version | 'v1']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: opus
---

# Team: Launch

Runs every pre-launch check at once and turns the results into a single
go/no-go decision for the user. It writes the audit reports and a summary;
it never deploys, changes DNS or flips production flags.

## Inputs

- `project.yaml`: `modes.rigor`, `budgets`, `a11y.standard`, `privacy.regions`, `stack.*`, `project.type`
- The release scope (done stories), PRD critical journeys
- A preview/staging URL from the user (asked in Phase 1) for live checks

## Agents

| Agent | Check | Report |
|---|---|---|
| `performance-engineer` | `/perf-audit` | `production/audits/perf-YYYY-MM-DD.md` |
| `accessibility-specialist` | `/a11y-audit` | `production/audits/a11y-YYYY-MM-DD.md` |
| `security-lead` | `/security-audit` → `SEC-LAUNCH` | `production/audits/security-YYYY-MM-DD.md` |
| `security-lead` | `/dependency-audit` | `production/audits/deps-YYYY-MM-DD.md` |
| `seo-specialist` | `/seo-audit` (skip for `api`) | `production/audits/seo-YYYY-MM-DD.md` |
| `privacy-compliance-specialist` | `/privacy-audit` | `production/audits/privacy-YYYY-MM-DD.md` |
| `qa-lead` | `/team-qa` → `QA-RELEASE` | `production/releases/<version>/test-plan.md` |
| `release-manager` | Orchestrates, go/no-go | `production/releases/<version>/go-no-go.md` |

Which audits are required depends on rigor (`.claude/docs/config-resolution.md`):
`minimal` perf + security; `standard` perf, a11y, security, seo; `full` all six.
Optional ones are offered, not skipped silently.

## Phases

### Phase 1: Scope

Ask for the version label and a preview or staging URL. Confirm which
audits will run (required + any optional the user wants).

### Phase 2: Audits in parallel

Issue all audit agents' calls before waiting for any. Each writes its report
at the path above (named by this skill, so no second approval under
`auto`; otherwise approve the batch once). Collect results; if an agent is
BLOCKED (e.g. no URL, tool missing), record `NOT ASSESSED` with the reason
and continue.

### Phase 3: Go/no-go summary

`release-manager` builds the table:

| Check | Verdict | Blocking findings | Owner |
|---|---|---|---|

Plus the go/no-go inputs from its checklist: migrations reviewed and backup
taken, monitoring and alerts live (`/observability-setup`), rollback steps
known, legal pages present. Overall recommendation:
- **GO**: all required checks PASS, no open high/critical findings
- **GO WITH CONCERNS**: only non-blocking concerns, each with an owner and date
- **NO-GO**: any required FAIL or open high/critical security finding

Ask "May I write this to `production/releases/<version>/go-no-go.md`?"

### Phase 4: The user decides

Present the recommendation. A NO-GO can be overridden only by the user, and
the override and the accepted risks are recorded in the file.

## Next step

GO → `/launch-checklist` (first launch) or `/release-checklist`. NO-GO →
fix stories for the blockers, then re-run only the failed audits.
