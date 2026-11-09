---
name: sprint-status
description: "Read-only snapshot of the current sprint: goal, done vs planned points, stories by status, blockers, and whether the goal is at risk. Use when the user asks how the sprint is going, what's left, or at the end of a session."
argument-hint: "[sprint-NN]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash(bash .claude/scripts/*)
model: haiku
---

# Sprint Status

Read-only. Writes nothing.

## Inputs

- The latest (or named) `production/sprints/sprint-NN.md`
- `bash .claude/scripts/story-list.sh` for the status of each listed story
- `production/session-state/active.md` for the active story

## Phases

### Phase 1: Collect

For each story in the sprint: status and points. Compute planned, done,
in progress/review, not started, blocked.

### Phase 2: Report (≤ 12 lines)

```
Sprint 04 — goal: "Teams can invite members and see a shared dashboard"
Days: 3 of 5 | Points: 8 done / 13 planned (62%) | In review: 2 | Blocked: 1
Done:        S-021 Invite by email (3), S-022 Accept invite (3), S-024 Role badge (2)
In review:   S-023 Shared dashboard (3)
Not started: S-025 Remove member (2)
Blocked:     S-026 Seat limits — waiting on billing spec
Risk: on track if S-023 closes today; S-026 likely moves to next sprint.
Next: /story-done S-023
```

Risk rule: compare % points done with % time elapsed; more than 20 points of
percentage behind → "at risk". Name the one action that helps most.

## Next step

The action named in the report.
