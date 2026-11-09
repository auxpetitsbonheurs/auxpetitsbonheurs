# Skill Conventions

Every skill in `.claude/skills/<name>/SKILL.md` follows these conventions so
skills chain together: one skill's output path is the next skill's input.

## Frontmatter

```yaml
---
name: <kebab-name, same as folder>
description: "<What it does>. Use when <trigger situations>."   # < 400 chars, quoted
argument-hint: "[args]"            # or "[no arguments]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Bash(bash .claude/scripts/*), Agent
model: sonnet                      # opus for gates/architecture/security, haiku for mechanical
---
```

Only list the tools the skill needs. Read-only skills (status, help, audits that
only report) omit Write/Edit except for their report path.

## Body structure

1. `# Title` + one paragraph: what it produces, where, and what it never does.
2. `## Inputs`: files it reads (by section), `project.yaml` keys, arguments.
3. `## Phases`: numbered `### Phase N: …` steps. Questions use the question
   tool (or numbered options and end the turn). The question is the last thing
   in the reply. A skipped question is not an answer.
4. `## Output`: exact path(s) and the template used.
5. `## Rigor`: what changes under `minimal` / `standard` / `full` (omit if nothing).
6. `## Next step`: the one skill that usually follows.

Keep skills under ~150 lines. Point to templates and docs instead of inlining them.

## Shared rules

- **Read config with** `bash .claude/scripts/yaml-get.sh <key>`; write it only with
  `config-set.sh` / `set-stage.sh`, and only after the user agrees.
- **Ask before writing**: show the draft or a summary, then "May I write this to
  `<path>`?" Under `modes.automation: batch` ask once per phase changeset; under
  `auto` an orchestrating skill may write the docs it names without re-asking
  (never source code, config or outward-facing actions).
- **Spawn agents by roster name** (`.claude/docs/agent-roster.md`). Brief them with
  the goal, the input paths, the exact output path, and what is out of scope.
  Spawn independent agents in parallel. Stack work goes to the specialist that
  matches `project.yaml → stack`; if none matches, use the lead.
- **External skills**: if a dependency from `docs/RECOMMENDED-SKILLS.md` is
  installed, use it for its domain; otherwise say it is missing and continue with
  the skill's own checklist.
- **Gates** return exactly one of `PASS`, `CONCERNS`, `FAIL` (stage gates) or the
  verdicts the gate names, plus `NOT ASSESSED` for unreadable inputs.
- **Never** commit, push, deploy, run migrations against shared databases, use
  live payment keys, send email, or call paid APIs. Print the command for the
  user instead.
- **Session checkpoint**: skills that start or finish multi-step work append a
  short note to `production/session-state/active.md` (no approval needed).

## Paths (canonical)

| Artifact | Path |
|---|---|
| Brief | `docs/product/brief.md` |
| PRD | `docs/product/prd.md` |
| Personas | `docs/product/personas/<slug>.md` |
| Research | `docs/product/research/<topic>.md` |
| Brand guide | `docs/design/brand-guide.md` |
| Design system | `docs/design/design-system.md` + `docs/design/tokens.json` |
| UX flows / wireframes | `docs/design/ux/<flow-slug>.md` |
| Sitemap / content | `docs/content/sitemap.md`, `docs/content/content-strategy.md` |
| Feature spec | `docs/specs/features/<feature-slug>.md` |
| API contract | `docs/architecture/api/openapi.yaml` (or the spec's `## API Contract` section for RPC/server-action stacks) |
| Data model | `docs/architecture/data-model.md` |
| Architecture | `docs/architecture/architecture.md` |
| ADR | `docs/architecture/adr/NNNN-<slug>.md` (4-digit, next free number) |
| Epic | `production/epics/E-NN-<slug>.md` |
| Story | `production/stories/E-NN/S-NNN-<slug>.md` |
| Sprint | `production/sprints/sprint-NN.md` |
| Milestone | `production/milestones/<slug>.md` |
| Gate report | `production/gates/<stage>-YYYY-MM-DD.md` |
| Audit report | `production/audits/<type>-YYYY-MM-DD.md` (`perf`, `a11y`, `security`, `deps`, `seo`, `privacy`) |
| Release | `production/releases/<version-or-date>/checklist.md`, `notes.md` |
| Incident / postmortem | `production/incidents/YYYY-MM-DD-<slug>.md` (+ `-postmortem.md`) |
| Experiment | `production/experiments/EXP-NN-<slug>.md` |
| Analytics plan | `production/analytics/tracking-plan.md` |
| Bug | `production/bugs/BUG-NNN-<slug>.md` |
| Tech debt | `production/tech-debt.md` |
| Retro | `production/retros/YYYY-MM-DD.md` |
| Prototype | `prototypes/<slug>/` (+ `README.md` with the finding) |
| Audit report (other types) | `production/audits/<type>[-<slug>]-YYYY-MM-DD.md` — also `ux-review`, `design-review`, `architecture-review`, `consistency`, `cro`, `polish`, `perf-load` |
| Working prototype | `prototypes/<slug>/` with `README.md` containing `Type: working-prototype` and a version log |
| Test session | `production/test-sessions/YYYY-MM-DD-<slug>.md` (plan, live notes, findings in one file) |
| Client demo | `docs/design/demo/<slug>/` (static clickable prototype + `notes.md`, `feedback.md`) |
| Wireframes | `docs/design/ux/<slug>-wireframes.md`; HTML mockups in `docs/design/ux/<slug>/` |
| GraphQL schema | `docs/architecture/api/schema.graphql` |
| Threat model | `docs/architecture/threat-model.md` (per feature: `docs/architecture/threat-models/<slug>.md`) |
| Runbook | `docs/runbooks/<slug>.md` (deploy/rollback: `production/releases/runbook.md`) |
| First launch | `production/releases/launch/checklist.md` |
| Release extras | `production/releases/<version>/test-plan.md`, `go-no-go.md`, `smoke.md` |
| Test plan (feature) | `production/test-plans/<slug>.md` |
| Estimate | `production/estimates/<slug>.md` |
| Milestone review | `production/milestones/<slug>-review.md` |
| Funnel review | `production/analytics/funnel-review-YYYY-MM-DD.md` |
| Growth sprint | `production/sprints/growth-sprint-NN.md` |
| Email flows | `docs/content/email-flows.md`; templates `docs/content/email/` |
| Content calendar | `docs/content/content-calendar.md` |
| Critical journeys | `tests/e2e/CRITICAL-JOURNEYS.md` (IDs `J-NN`; Playwright tags `@p0`, `@journey:J-NN`) |
| AI eval sets | `tests/evals/<feature>.jsonl` |
| Load tests | `tests/load/*.js` |
| Changelog | `CHANGELOG.md` (repo root) |
| Infrastructure | `infra/` |

## Verdict vocabularies

| Where | Verdicts |
|---|---|
| Stage gates (`/gate-check`, `.claude/docs/gates.md`) | `PASS`, `CONCERNS`, `FAIL` |
| Director/lead gates (`PD-PRD`, `TD-ARCH`, `DD-REVIEW`, `SEC-REVIEW`…) | `APPROVE`, `CONCERNS`, `REJECT` |
| `/review-code` | `APPROVE`, `APPROVE WITH CHANGES`, `CHANGES REQUESTED` |
| QA (`QA-STORY`, `QA-RELEASE`) and go/no-go | `PASS`, `FAIL` (go/no-go: `GO`, `NO-GO`) |

Any gate may also return `NOT ASSESSED` naming the input it could not read.

## Bug file format

```markdown
# BUG-004: Checkout button does nothing on Safari 17
Status: new              # new | open | in-progress | fixed | verified | closed | duplicate of BUG-NNN | wontfix
Severity: S2             # S1 outage/data loss/security · S2 major broken flow · S3 minor · S4 cosmetic
Priority: P1             # P0 now · P1 this sprint · P2 next · P3 backlog
Owner: ui-engineer
Regression test: tests/e2e/checkout.spec.ts
Found in: <version/commit/URL>
```

Followed by `## Steps to reproduce`, `## Expected`, `## Actual`, `## Environment`, `## Notes`.

## Story file format

```markdown
# S-007: Reset password by email
Status: ready            # draft | ready | in-progress | review | done | blocked
Epic: E-02-accounts
Spec: docs/specs/features/password-reset.md#flow
Estimate: 3 pts
Owner: api-engineer, ui-engineer

## Story
As a user who forgot my password, I want a reset link by email, so that I can get back in.

## Acceptance Criteria
- [ ] AC1: Given a registered email, when I request a reset, then a single-use link valid for 60 min is emailed.
- [ ] AC2: Given an unknown email, when I request a reset, then I see the same confirmation (no enumeration).

## Tests
- AC1 → tests/integration/password-reset.test.ts
- AC2 → tests/integration/password-reset.test.ts

## Notes
```

`bash .claude/scripts/story-list.sh [status]` lists stories as `id|status|estimate|path`.

## Session checkpoint format (`production/session-state/active.md`)

```markdown
Active story: S-007 Reset password by email
Stage: build
Updated: 2026-11-08 14:20

## Doing
## Done this session
## Next
## Open questions
```

The status line reads the `Active story:` line.

## Templates

`.claude/docs/templates/<name>.md` (plus `design-tokens.json` and
`api-contract.yaml`). Names are listed in `docs/BLUEPRINT.md` §7.

## Helper scripts available

| Script | Prints |
|---|---|
| `yaml-get.sh <key>` | value of a `project.yaml` key |
| `config-set.sh [--local] k=v` | sets a key |
| `set-stage.sh <stage>` | sets `project.stage` |
| `project-state.sh` | `key: value` facts about what exists |
| `detect-stack.sh` | `key: value` guesses of frontend/backend/db/orm/hosting/test tools from manifests |
| `test-run.sh [unit|e2e|all]` | runs the project's test command and prints `result: pass|fail` + summary |
| `story-list.sh [status]` | `id|status|estimate|path` per story |
| `next-number.sh <dir-or-file> [prefix]` | next free ID: ADRs (`0003`), `E-`, `S-`, `BUG-`, `EXP-`; with a file, IDs inside it (`TD-`) |

Scripts report observations; skills decide.
