---
name: team-qa
description: "Orchestrates QA (qa-lead, test-engineer, accessibility-specialist, performance-engineer) to write a release test plan, map acceptance criteria to tests, find coverage gaps, fill them, and return a QA-RELEASE verdict. Use before a release or milestone, or when test coverage is doubtful."
argument-hint: "[release version | milestone slug]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Team: QA

Produces a test plan at `production/releases/<version>/test-plan.md`
(template `.claude/docs/templates/test-plan.md`), fills the gaps it finds
(with approval), and ends with a `QA-RELEASE` verdict from `qa-lead`. It never
skips or weakens a failing test to get green.

## Inputs

- Stories in the release (`story-list.sh done` + `review`)
- Feature specs and the PRD's critical journeys
- Existing tests under `tests/` and the code root
- `project.yaml`: `modes.rigor`, `budgets`, `a11y.standard`, `stack.test_unit`, `stack.test_e2e`

## Agents

| Agent | Role here |
|---|---|
| `qa-lead` | Test plan, gap analysis, `QA-RELEASE` verdict |
| `test-engineer` | Missing unit/integration/e2e tests, flaky-test fixes |
| `accessibility-specialist` | axe + keyboard + screen-reader pass on key pages |
| `performance-engineer` | Lighthouse/Web Vitals against budgets on key routes |

## Phases

### Phase 1: Plan

`qa-lead` drafts the plan: scope (stories, journeys), the acceptance
criteria → test matrix, environments (local, preview URL), data, entry/exit
criteria per rigor. Ask before writing it.

### Phase 2: Gap analysis + audits (parallel)

- `test-engineer`: for each acceptance criterion find its test (stories' `## Tests` sections, grep); list criteria with no test and critical journeys without Playwright coverage
- `accessibility-specialist`: a11y pass on changed and critical pages
- `performance-engineer`: budgets check on key routes

### Phase 3: Fill gaps

`test-engineer` writes the missing tests (approval per file batch). Run
`bash .claude/scripts/test-run.sh all`; report pass/fail honestly. A test that
reveals a bug creates a bug file (`/bug-report`), it is not deleted.

### Phase 4: Verdict

`qa-lead` returns `QA-RELEASE`: `PASS`, `CONCERNS` (list, each with severity)
or `FAIL` (blocking items). Inputs that could not be checked are
`NOT ASSESSED` with the reason.

### Phase 5: Report

Coverage matrix, results, audit summaries, verdict, open bugs. Name any
BLOCKED agent. Append a checkpoint note.

## Next step

`/team-launch` or `/release-checklist`.
