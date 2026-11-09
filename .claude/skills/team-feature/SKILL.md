---
name: team-feature
description: "Orchestrates a full-stack feature with the whole team: spec and readiness check, contract freeze, parallel backend/frontend/design work by the stack specialists, tests, code review, and story closure. Use when building a whole feature (several stories across frontend and backend) rather than a single story."
argument-hint: "<feature-slug | E-NN>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git status*), Bash(git diff*)
model: opus
---

# Team Feature

The full-stack orchestration. It sequences existing skills and briefs agents in
parallel where the work is independent. Each phase ends with a user checkpoint;
nothing proceeds on a skipped question.

## Inputs

- `docs/specs/features/<feature-slug>.md` (or the specs linked from epic `E-NN`)
- Its stories (`production/stories/E-NN/`)
- `project.yaml → stack`, `modes.rigor`, `modes.automation`, `.claude/docs/stack-matrix.md`

## Phases

### Phase 1: Readiness

Run the `/story-readiness` checks on the feature's stories. Not-ready stories are
listed with owners; the user decides to fix them first (recommended) or continue
with the ready subset.

### Phase 2: Contract freeze

`lead-backend` and `lead-frontend` review the spec's API contract and data model
together (in parallel, then reconcile). Output: the frozen contract (endpoints/actions,
request/response types, errors) and the data model change. If a change is needed,
update the spec (ask first) before any code. If a migration is needed, run
`/db-migration` now.

### Phase 3: Build in parallel

Order the stories by dependency. For each wave of independent stories, brief in
parallel:
- **backend**: the backend specialist for `stack.backend` (+ `api-engineer`): handlers,
  domain logic, integration tests
- **frontend**: the frontend specialist for `stack.frontend` + `ui-engineer`: routes,
  components, states, component tests, against the frozen contract (typed client/mocks)
- **design support** (UI stories): `ui-designer` checks components against the design system
- **integrations** when the stories touch them: `auth-specialist`, `payments-specialist`, …

Each brief: story IDs and ACs it owns, exact paths, the contract section, "TDD per
AC; ask before writing outside these paths; report tests run". Under
`modes.automation: batch` the user approves each wave's changeset once.

### Phase 4: Integrate and test

Wire frontend to the real endpoints; `test-engineer` writes/updates the Playwright
journey for the feature (`/e2e`). Run `bash .claude/scripts/test-run.sh all`, lint,
typecheck. Fix until green.

### Phase 5: Review

Run `/review-code` on the feature diff (frontend, backend, security in parallel).
Resolve blockers and majors.

### Phase 6: Close

`/story-done` for each story. Summarise: stories done, tests added, deviations
from the spec (with the spec edits applied), follow-ups. Update the checkpoint.
Suggest commit messages per story; do not commit.

## Next step

`/sprint-status`, or `/team-qa` before a release.
