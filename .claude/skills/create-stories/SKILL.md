---
name: create-stories
description: "Writes INVEST user stories with Given/When/Then acceptance criteria and an acceptance-criterion-to-test map for an epic. Use when an epic has no stories yet, when a spec changed and stories must follow, or when the user asks to break work down."
argument-hint: "<E-NN | epic-slug>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Bash(bash .claude/scripts/*), Agent
model: sonnet
---

# Create Stories

Breaks one epic into user stories in `production/stories/E-NN/S-NNN-<slug>.md`,
in the story file format from `.claude/docs/skill-conventions.md`. Each story
is a vertical slice a user can see or an API client can call, small enough to
finish in one or two sessions. It writes stories as `Status: draft`; only
`/story-readiness` marks them `ready`.

## Inputs

- The epic file (`production/epics/E-NN-*.md`)
- The epic's linked specs, read by section: `Requirements`, `User Flow`,
  `States`, `API Contract`, `Data Model`, `Edge Cases`
- `docs/architecture/api/openapi.yaml` sections for the endpoints involved
- Existing stories in `production/stories/` (numbering is global)

## Phases

### Phase 1: Slice

Spawn `product-manager` with the epic and spec sections. Ask for stories that are
**INVEST**: Independent, Negotiable, Valuable, Estimable, Small, Testable.
Slice by user outcome (happy path first, then error and edge paths), never by
layer ("build the table", "build the form"). Typical first slice: the thinnest
UI → API → DB path for the main flow.

### Phase 2: Acceptance criteria

For each story, criteria in **Given / When / Then**, including:
- the happy path
- validation errors and empty states
- permission cases (anonymous, wrong role, other tenant's record)
- limits (pagination, quotas, rate limits) where the spec names them

Each criterion gets an ID (`AC1`…) and a planned test location under `## Tests`:
unit (`tests/unit/…`), integration (`tests/integration/…`) or e2e
(`tests/e2e/…`). Under `minimal`, the map may stay "TBD" for non-logic stories.

### Phase 3: Estimate and own

Ask `lead-frontend` and `lead-backend` (in parallel) to estimate each story in
points (1, 2, 3, 5, 8) and name the owning specialist(s) using
`.claude/docs/stack-matrix.md`. A story estimated at 8 must be split.

### Phase 4: Review

Show a table: ID, title, ACs (count), estimate, owners, dependencies. Ask the
user to approve, split, merge or drop stories.

### Phase 5: Write

Numbers come from `bash .claude/scripts/next-number.sh production/stories S-`.
Ask "May I write these N stories to `production/stories/E-NN/`?" On yes, write
each from `.claude/docs/templates/story.md` with `Status: draft`, and add the
story IDs to the epic's story list.

## Output

`production/stories/E-NN/S-NNN-<slug>.md` per story; epic file updated with links.

## Next step

`/story-readiness E-NN` to check and mark the stories ready.
