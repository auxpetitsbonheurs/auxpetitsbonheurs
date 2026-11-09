---
name: bug-triage
description: "Triages open bugs by severity × frequency, assigns an owner agent, sets priority and target sprint, flags duplicates, and requires a regression test for each fix. Use when bugs pile up, at sprint planning, or after an audit or launch produces several findings."
argument-hint: "[no arguments]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Bug Triage

Puts the bug list in order and decides who handles what, editing the
`Priority`, `Owner` and `Status` lines of files in `production/bugs/` after
approval. It does not fix bugs.

## Inputs

- `production/bugs/BUG-*.md` with status `new` or `open`
- Error-tracking counts if the user can share them (frequency)
- `.claude/docs/agent-roster.md` (owners), current sprint in `production/sprints/`

## Phases

### Phase 1: Load

List open bugs: ID, title, severity, environment, age, frequency (if known),
and whether it has a reproduction. Bugs without a reproduction go to a
"Needs info" list with the question to ask.

### Phase 2: Deduplicate

Group bugs with the same symptom or suspected area; propose a primary and mark
the rest `duplicate of BUG-NNN`.

### Phase 3: Prioritise

Priority from severity × frequency × reach:

| | Many users / often | Some users | Rare |
|---|---|---|---|
| **S1** | P0 (hotfix now) | P0 | P1 |
| **S2** | P1 (this sprint) | P1 | P2 |
| **S3** | P2 (next sprint) | P3 | P3 |
| **S4** | P3 (backlog) | P3 | won't fix? |

Security and payments bugs never go below P1. P0 → suggest `/hotfix`.

### Phase 4: Assign

Owner agent by area (UI → `ui-engineer`, API → `api-engineer`, data →
`data-engineer`, auth → `auth-specialist`, payments → `payments-specialist`,
performance → `performance-engineer`, a11y → `accessibility-specialist`,
SEO → `seo-specialist`, infra → `devops-lead`), using the stack specialist
when the fix is framework-specific. Every bug gets a "Regression test" line
naming the test that must fail before and pass after the fix.

### Phase 5: Confirm and write

Show the triage table (ID, priority, owner, target sprint, regression test).
Ask "May I update these bug files?" and list them. Offer to add P1s to the
current sprint via `/sprint-plan`.

## Output

Updated `production/bugs/BUG-*.md` header lines; triage summary in chat.

## Next step

`/hotfix` for P0, `/sprint-plan` for P1/P2.
