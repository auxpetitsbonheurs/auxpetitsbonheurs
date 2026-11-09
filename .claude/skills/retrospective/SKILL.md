---
name: retrospective
description: "Runs a sprint or milestone retrospective with the producer: what was planned vs done, what helped, what hurt, and one or two concrete changes to try next. Use at the end of a sprint, milestone or launch."
argument-hint: "[sprint-NN | milestone slug | 'launch']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git log*)
model: sonnet
---

# Retrospective

Writes `production/retros/YYYY-MM-DD.md` (template
`.claude/docs/templates/retrospective.md`). Facilitated by `producer`. For a
solo founder it is short and honest: two or three changes, not a wishlist.

## Inputs

- The sprint file `production/sprints/sprint-NN.md` or milestone file
- `bash .claude/scripts/story-list.sh` (planned vs done, estimates)
- `git log` for the period; incidents and bugs filed in the period
- The previous retro's "try next" items

## Phases

### Phase 1: Facts

Spawn `producer` to compute: stories planned vs done, points planned vs
done, estimate accuracy (actual vs estimate where recorded), carry-over,
bugs found/fixed, incidents. Show the numbers without judgement.

### Phase 2: Follow-up on last time

For each "try next" item from the previous retro: did we do it, did it help?

### Phase 3: Ask the user

Ask in one message (free text is fine):
1. What went well this sprint?
2. What slowed you down or frustrated you?
3. Anything that surprised you?

Add the producer's observations (e.g. "stories over 5 points slipped every
time", "e2e flakiness cost ~3 hours").

### Phase 4: Decide changes

Propose up to three changes, each specific and testable ("split stories over
5 points", "run `/story-readiness` before planning", "cap the sprint at 12
hours"). Ask the user to choose one or two.

### Phase 5: Write

Ask "May I write this to `production/retros/YYYY-MM-DD.md`?" If a change
affects process settings (e.g. rigor), point to `/settings` and do not change it here.

## Output

`production/retros/YYYY-MM-DD.md`

## Next step

`/sprint-plan` for the next sprint, applying the chosen changes.
