---
name: create-epics
description: "Breaks the PRD and feature specs into epics, each a user-visible capability with a goal, scope and exit criterion. Use when the design gate has passed and there are no epics yet, or when a new PRD section or feature spec needs epics."
argument-hint: "[feature-slug | 'all']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Bash(bash .claude/scripts/*), Agent
model: sonnet
---

# Create Epics

Turns requirements into epics in `production/epics/E-NN-<slug>.md`. An epic is
a capability a user would notice ("Accounts", "Team billing", "Blog"), not a
technical layer ("Database", "Frontend"). It writes epics only; stories come
from `/create-stories`. It never edits the PRD or specs.

## Inputs

- `docs/product/prd.md`: read the functional requirements and scope sections by heading
- `docs/specs/features/*.md`: titles, goals and requirement IDs
- Existing `production/epics/` (to avoid duplicates and continue numbering)
- `project.yaml`: `project.type`, `modes.rigor`
- Argument: one feature slug, or `all` (default: every spec without an epic)

## Phases

### Phase 1: Map requirements

Grep the PRD for requirement IDs (`FR-`, `NFR-`) and headings. Grep each spec's
`Requirements` / `Traces` section. Build a table: requirement → spec → existing
epic (if any). Requirements with no spec are listed separately; do not invent
specs for them.

### Phase 2: Propose epics

Spawn `product-manager` with the table and ask for an epic breakdown that:
- groups requirements into 3–10 user-facing capabilities per release
- orders them by dependency and by the PRD's priorities (MVP first)
- gives each a one-sentence goal, in-scope / out-of-scope lists, linked specs
  and requirement IDs, and an exit criterion a demo can show

Under `modes.rigor: full`, also ask `producer` to tag each epic with the
milestone it belongs to.

### Phase 3: Review with the user

Show the epics as a table (ID, name, goal, specs, priority, milestone). Ask:
"Does this breakdown look right?" Options: `Approve`, `Merge/split some`,
`Reorder`, `Change scope`. Iterate until approved. A skipped question is not
approval.

### Phase 4: Write

Get the next number with `bash .claude/scripts/next-number.sh production/epics E-`.
Ask "May I write these N epics to `production/epics/`?" On yes, write each from
`.claude/docs/templates/epic.md`. Append a line to
`production/session-state/active.md`.

## Output

`production/epics/E-NN-<slug>.md`, one per epic, using the `epic` template.

## Rigor

- `minimal`: goal, scope and linked specs only; milestones optional.
- `standard`: plus exit criterion and requirement IDs.
- `full`: plus milestone, risks and `producer` sign-off (`PR-MILESTONE` input).

## Next step

`/create-stories E-NN` for the highest-priority epic.
