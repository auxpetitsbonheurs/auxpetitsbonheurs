---
name: postmortem
description: "Writes a blameless postmortem for an incident: timeline, impact, root cause via 5-whys, what went well and badly, and action items turned into stories. Use after any SEV1/SEV2 incident, or for repeated SEV3s."
argument-hint: "<incident file or slug>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git log*)
model: opus
---

# Postmortem

Writes `production/incidents/YYYY-MM-DD-<slug>-postmortem.md` (template
`.claude/docs/templates/postmortem.md`) and turns action items into stories.
Blameless: it describes systems and decisions, never people's failings.

## Inputs

- The incident file (argument); its timeline is the backbone
- Related commits, the hotfix, the release notes for the triggering deploy
- `docs/architecture/runbook.md`, alerts configuration

## Phases

### Phase 1: Reconstruct

From the incident file, build the timeline: trigger, detection (how and how
long after the trigger), response, mitigation, resolution. Compute
time-to-detect, time-to-mitigate and duration. Ask the user to fill gaps.

### Phase 2: Root cause (5 whys)

Run the five whys with `observability-engineer` and the owning lead. Stop at
a cause the team can change (a missing test, a missing alert, an unsafe
migration pattern, an unclear runbook). Often there are several contributing
factors; list each.

### Phase 3: Reflect

- What went well (detection, rollback worked, clear runbook)
- What went badly
- Where we got lucky

### Phase 4: Action items

Each action item: what, why (which factor it addresses), type (`prevent`,
`detect`, `mitigate`), owner agent, priority. Prefer systemic fixes (tests,
alerts, guardrails, hooks) over "be more careful". Spawn `producer` to
place them in the backlog.

### Phase 5: Write

Show the draft and ask "May I write this to
`production/incidents/YYYY-MM-DD-<slug>-postmortem.md`?" Then offer to create
the action items as stories under `production/stories/` (story format from
the conventions, IDs via `next-number.sh`).

## Output

The postmortem file; optional stories.

## Next step

`/sprint-plan` to schedule the action items.
