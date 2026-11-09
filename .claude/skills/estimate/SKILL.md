---
name: estimate
description: "Estimates a feature, epic, story or the whole MVP as a t-shirt size plus an hours range with a confidence level, broken into tasks with risks and assumptions. Use when planning sprints, answering 'how long will this take?', comparing options, or before committing to a date."
argument-hint: "<feature-spec path | epic id | story id | mvp>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/story-list.sh*), Bash(bash .claude/scripts/yaml-get.sh *)
model: sonnet
---

# Estimate

Produces an estimate from `.claude/docs/templates/estimate.md`: a t-shirt
size, an hours range (optimistic / likely / pessimistic), a confidence level
and the task breakdown. An estimate is a range, never a promise.

## Inputs

- Argument: a feature spec path, an epic (`E-NN`), a story (`S-NNN`), or `mvp`
- The spec / epic / story file, the API contract and data model sections it touches
- `stack.*` and `specialists` (familiar vs new technology changes the range)
- Past actuals: story files with `Estimate:` and `Actual:` lines, if any, for calibration

## Phases

### Phase 1: Break down

Spawn the relevant lead(s) (`lead-frontend`, `lead-backend`, and others the
work touches) in parallel. Brief: "List the tasks to deliver this including
tests, migrations, UI states, a11y, docs and review. For each: optimistic,
likely, pessimistic hours. Flag unknowns." Always include: tests (TDD adds
time up front), integration work, review/fix cycles, and deploy/config.

### Phase 2: Combine

- Per task, PERT expected = (O + 4L + P) / 6.
- Total range: sum of O … sum of P; report the expected total.
- Size: S ≤ 8 h, M ≤ 24 h, L ≤ 60 h, XL > 60 h (XL → recommend splitting).
- Confidence: **high** (familiar stack, clear spec), **medium**, **low**
  (unknown tech, vague spec, third-party dependency). Low confidence →
  recommend `/tech-spike` first.
- Calibrate: if past actuals exist, show the average actual/estimate ratio and
  the adjusted range.

### Phase 3: Present

Show the table, the top 3 risks and assumptions, and what would shrink the
range. For a story, offer to set its `Estimate:` line in points (1 pt ≈ the
team's agreed hours; ask if not recorded). Writing a separate estimate file is
optional: ask "Save this to `production/estimates/<slug>.md`?" (create the
folder if needed).

## Output

Chat, plus optionally `production/estimates/<slug>.md` or a story's
`Estimate:` line (after a yes).

## Next step

`/sprint-plan` or `/scope-check`.
