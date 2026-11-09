---
name: milestone-review
description: "Producer-led milestone review (gate PR-MILESTONE): checks the milestone's exit criterion and demoable outcome, planned vs delivered scope, quality signals, metrics and risks, and decides whether it is met. Use at the end of a milestone such as MVP, beta or launch, or when asked how a milestone is going."
argument-hint: "[milestone slug]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git log*)
model: sonnet
---

# Milestone Review

Asks one honest question: did this milestone deliver its exit criterion? It
writes the review into `production/milestones/<slug>-review.md`. It never
moves dates or cuts scope by itself; it gives the user options.

## Inputs

- `production/milestones/<slug>.md` (exit criterion, planned epics/stories, dates)
- `bash .claude/scripts/story-list.sh` (status of every story)
- Sprint files in `production/sprints/`, latest audits, open bugs in `production/bugs/`
- Metrics from `production/analytics/` if the milestone has a metric target

If no slug is given, list milestones and ask which.

## Phases

### Phase 1: Facts

Compute: stories planned vs done vs carried over, points planned vs delivered,
bugs opened/closed by severity, audits run and open Critical/High findings,
the milestone's manual test session (`production/test-sessions/`: task success
rates, open S1/S2 findings), dates planned vs actual. Under `standard`/`full`, a
milestone without a test session on its build is `NOT ASSESSED` until
`/test-session` runs. Show them as a table before any judgement.

### Phase 2: Exit criterion

Spawn `producer` for the `PR-MILESTONE` gate with the facts and the exit
criterion. Evidence must be concrete: a demo the user can run, a passing
journey, a metric value. Verdict: `MET`, `PARTIALLY MET`, `NOT MET`, or
`NOT ASSESSED` (naming the missing input).

### Phase 3: Learn

What slipped and why (estimates, scope added, blockers, unknowns), what went
well, and the estimate accuracy ratio to calibrate future planning.

### Phase 4: Options

For anything not met, offer 2–3 options with costs: extend the milestone,
move items to the next milestone, cut scope (name it), or accept as is. The
user decides; record the decision.

### Phase 5: Write

Ask "May I write this to `production/milestones/<slug>-review.md`?"
(template `milestone-review`). Suggest `/retrospective` for process changes.

## Output

`production/milestones/<slug>-review.md` (template: `.claude/docs/templates/milestone-review.md`).

## Next step

`/retrospective`, then `/sprint-plan` for the next milestone.
