---
name: ux-flow
description: "Maps a user journey end to end, including error, empty, loading, permission and edge paths, as a step table and mermaid flowchart. Use for signup, onboarding, checkout, the core task, settings or any multi-step interaction before it is designed or built."
argument-hint: "<journey name, e.g. 'signup' or 'checkout'>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# UX Flow

Produces `docs/design/ux/<flow-slug>.md`: the journey a user takes to finish
one job, every branch it can take, and the screens and states each step needs.
It does not set visual design (`/wireframe`, `ui-designer`) or write code.

## Inputs

- Argument: the journey. Without one, list journeys implied by the PRD and
  personas and ask which to map.
- `docs/product/prd.md` (requirement and success metric for this journey)
- `docs/product/personas/*.md` (who walks it, on what device, with what knowledge)
- `docs/content/sitemap.md` (where it starts and ends)
- Related `docs/specs/features/*.md`, if one already exists
- `project.yaml`: `project.type`, `i18n.locales`, `a11y.standard`

## Phases

### Phase 1: Frame the journey

State: persona, trigger (how they arrive), goal, success end state, the PRD
metric it moves, and the device/context assumption (mobile-first unless the
personas say otherwise). Ask the user to confirm or correct.

### Phase 2: Map the happy path

Spawn `ux-lead` with the frame. Produce a numbered step table:

| # | Screen / state | User action | System response | Data needed | Copy needed |

Keep the happy path to the fewest steps that meet the goal. For each step,
challenge: can it be removed, deferred until later, or pre-filled?

### Phase 3: Map every other path

For each step, add branches for:
- **Validation errors** (field-level, inline, preserving input)
- **System errors** (network, timeout, 5xx: retry, what is saved)
- **Empty states** (first use, no results) with a next action
- **Loading** (> 300 ms skeleton; > 1 s progress or optimistic UI)
- **Permissions** (signed out, wrong role, wrong tenant, plan limit reached)
- **Edge cases** (back button, refresh, duplicate submit, expired link/session,
  second tab, slow network, abandoning midway and returning)
- **Accessibility** (focus moves on step change, errors announced, keyboard-only)

Spawn `accessibility-specialist` and `copywriter` in parallel to review the
branches (focus/announcements; microcopy needs) and fold their notes in.

### Phase 4: Diagram

Draw a mermaid `flowchart TD` with the happy path as the spine and branches
labelled. Keep under ~30 nodes; split sub-flows into their own docs if larger.

### Phase 5: Approve and write

Show the frame, table, branches and diagram. Ask
"May I write this to `docs/design/ux/<flow-slug>.md`?"

## Output

`docs/design/ux/<flow-slug>.md` from `.claude/docs/templates/ux-flow.md`.

## Rigor

- `minimal`: happy path + error and empty branches.
- `standard`: all branch types.
- `full`: as standard, plus a `/ux-review` of the flow before it is marked final.

## Next step

`/wireframe <flow-slug>` for the screens, or `/feature-spec` if the flow is the
UX section of a feature.
