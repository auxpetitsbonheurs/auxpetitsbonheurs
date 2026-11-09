---
name: sprint-plan
description: "Plans the next sprint with the producer: asks for real capacity first, selects only ready stories in priority order, leaves about 20% slack, and writes the sprint file. Use at the start of a sprint, when the backlog has ready stories, or when the user asks what to work on this week."
argument-hint: "[length, e.g. '1w' | '2w']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Sprint Plan

A solo founder's sprint is planned in real hours, not ideal ones. Writes
`production/sprints/sprint-NN.md` (template `sprint-plan`). Never changes story
contents; only selects them.

## Inputs

- `bash .claude/scripts/story-list.sh ready` (and `in-progress` carry-overs)
- Epics' priorities and milestones (`production/epics/`, `production/milestones/`)
- The previous sprint file (planned vs done points = velocity)
- `production/tech-debt.md` and open `production/bugs/` (severity S1/S2)

## Phases

### Phase 1: Capacity (always first)

Ask: "How many hours can you realistically put in this sprint?" and the sprint
length (argument or default 1 week). If there is a previous sprint, show its
velocity (points done ÷ hours) and use it; otherwise assume ~1 point per 2–3 hours
and say it's a guess.

### Phase 2: Draft

Spawn `producer` with capacity, velocity, ready stories, carry-overs, S1/S2 bugs and
top tech-debt items. Rules:
- carry-overs first, then S1/S2 bugs, then stories by epic priority
- only `ready` stories (others → suggest `/story-readiness`)
- fill to ~80% of capacity; the rest is slack for surprises
- include at most one tech-debt item unless the user asks for more
- one sprint goal sentence a demo can show

### Phase 3: Review

Show: goal, capacity, planned points vs capacity, the list (ID, title, points,
owner), what was left out and why. Ask to approve, add or remove items. A story
added over capacity must displace another; say which.

### Phase 4: Write

`NN` = next number. Ask "May I write `production/sprints/sprint-NN.md`?" Update the
checkpoint with the sprint goal.

## Next step

`/dev-story` for the first story in the sprint.
