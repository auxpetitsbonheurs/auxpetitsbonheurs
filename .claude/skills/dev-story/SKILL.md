---
name: dev-story
description: "Implements one ready story end to end, test-first: reads the spec and contract, briefs the right stack specialists, runs the TDD loop per acceptance criterion, runs tests/lint/typecheck, and hands the result to review. Use when the user wants to build a story or asks 'what should I build next?' in the Build stage."
argument-hint: "[S-NNN]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git status*), Bash(git diff*)
model: sonnet
---

# Dev Story

The core build loop. One story at a time, from `ready` to `review`. Code is
written only after the user approves the plan, and each acceptance criterion is
driven by a failing test first. It never commits, pushes or deploys.

## Inputs

- Argument `S-NNN`, or none: pick the first `ready` story of the current sprint
  (`production/sprints/`), else the first `ready` story from
  `bash .claude/scripts/story-list.sh ready`
- The story file, its `Spec:` sections (requirements, flow, states, contract, data model)
- Relevant ADRs (Grep `docs/architecture/adr/` for the feature)
- `project.yaml → stack` and `.claude/docs/stack-matrix.md` (specialist, test, lint and typecheck commands)
- `.claude/rules/` that match the paths the story will touch

## Phases

### Phase 1: Pick and confirm

Show the story title, ACs and estimate. If its status is not `ready`, say why
and suggest `/story-readiness`; stop unless the user insists (`minimal` only).
Ask "Start S-NNN?" On yes, set `Status: in-progress` and write the checkpoint
(`production/session-state/active.md`, format in the conventions) with
`Active story: S-NNN <title>`.

### Phase 2: Plan

Read the spec by section. Decide the slices: backend (schema, endpoint/action,
domain logic) and frontend (route, components, form, states). Pick specialists:

- backend → the backend specialist for `stack.backend`, plus `data-engineer` /
  the data specialist if the schema changes (then `/db-migration`)
- frontend → the frontend specialist for `stack.frontend` and `ui-engineer`
- integrations → `auth-specialist`, `payments-specialist`, etc. when the story touches them

Present the plan: files to create/change, interfaces, test list per AC, and any
spec gap as a numbered question. Ask "Does this plan work?" Wait.

### Phase 3: Build, test-first

For each AC in order, run the `/tdd` loop: write the failing test, show the
failure output, write the minimum code, show it passing, refactor.

If the contract is fixed and frontend and backend slices are independent, brief
both specialists **in parallel**; each brief names the story, the ACs it owns,
the exact paths, the contract section, and "write tests first; ask before
writing outside these paths". If the contract must change, stop and ask; agree
it with `lead-frontend` and `lead-backend` and update the spec first.

### Phase 4: Verify

Run `bash .claude/scripts/test-run.sh all`, plus the lint and typecheck
commands from the stack matrix. All must pass. On failure, fix (back to Phase 3)
or report honestly; never skip or weaken a test.

### Phase 5: Hand off

Summarise: files changed (`git diff --stat`), ACs → tests (all green), commands
run and their results, deviations from the spec, follow-ups (tech debt, new
stories). Set `Status: review`, tick the ACs that have passing tests, update the
checkpoint's `## Done this session` and `## Next`.

## Rigor

- `minimal`: tests strongly recommended; a story may go to review with "tests: TBD" if the user says so.
- `standard`: every AC needs a passing test; lint and typecheck must pass.
- `full`: plus `/review-code` must run before `review`, and the a11y/perf hooks must be clean.

## Next step

`/review-code`, then `/story-done S-NNN`.
