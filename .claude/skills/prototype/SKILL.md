---
name: prototype
description: "Builds a fast, throwaway prototype to answer one question (does this flow make sense, can this API do X, will users get this layout) and writes up the finding. Use for clickable mockups, proofs of concept and risky ideas before committing to a spec."
argument-hint: "<question to answer>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Prototype

Answers **one question** as cheaply as possible, in `prototypes/<slug>/`, and
ends with a written finding, not a merge. Prototype code never moves into
`src/`; production re-implements it properly.

## Inputs

- The question (argument), or ask for it
- The brief/PRD sections the question relates to
- `project.yaml → stack` (a prototype may ignore it when a simpler tool answers faster)

## Phases

### Phase 1: Frame

Ask (or confirm) three things:
1. **The question**: e.g. "Will a single-page checkout fit our plan options?"
2. **Success looks like**: what result means yes, what means no.
3. **Time box**: 30 min, 2 h or half a day.

### Phase 2: Choose the cheapest form

| Question type | Form |
|---|---|
| Layout, flow, comprehension | Static or clickable HTML mockup (`web-artifacts-builder` if installed) |
| Visual direction | 2–3 HTML variants side by side (`frontend-design` if installed) |
| Third-party API capability | A single script hitting the **sandbox/test** API |
| Performance or feasibility | Minimal app or benchmark in the stack |

Name any missing dependency skill and continue without it.

### Phase 3: Build

Spawn `prototyper` with the question, the form, the time box and the folder
`prototypes/<slug>/`. Hard-coding and mocks are fine. No real customer data, no
production credentials, no paid calls without the user's go-ahead.

### Phase 4: Write the finding

`prototypes/<slug>/README.md`:
- Question, time spent
- Answer (yes / no / partly) and evidence (screenshots, numbers, output)
- What production would need (spec changes, ADR, stories)
- Recommendation

Ask before writing. Append the finding's path to the checkpoint.

## Next step

`/feature-spec` or `/architecture-decision` to act on the finding, or drop the idea.
