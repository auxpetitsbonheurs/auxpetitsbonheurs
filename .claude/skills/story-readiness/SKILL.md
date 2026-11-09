---
name: story-readiness
description: "Checks whether stories are ready to build: clear ACs, linked spec and contract, designs, estimate, no blocking dependencies. Use before sprint planning, before /dev-story, or when the user asks if a story is ready."
argument-hint: "<S-NNN | E-NN | 'all'>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, AskUserQuestion, Bash(bash .claude/scripts/*)
model: sonnet
---

# Story Readiness

Runs the Definition of Ready on one story, an epic's stories, or all `draft`
stories, and reports what is missing. It changes a story's `Status:` to `ready`
only after the user approves. It never rewrites criteria itself; it says what to
fix.

## Inputs

- Story files (via `bash .claude/scripts/story-list.sh draft`)
- Each story's `Spec:` link, the spec's `API Contract` and `UX` sections
- `docs/design/ux/` for referenced flows
- `modes.rigor`

## Phases

### Phase 1: Check each story

| # | Check | Fails when |
|---|---|---|
| R1 | Story sentence | No user, goal or reason |
| R2 | Acceptance criteria | Fewer than 2, not Given/When/Then, or untestable words ("fast", "nice", "works") |
| R3 | Failure paths | No validation, permission or empty-state criterion where the story has input or private data |
| R4 | Spec link | `Spec:` missing or the anchor does not exist |
| R5 | Contract | Story calls an endpoint or action not in the contract |
| R6 | UX | Story changes UI and no flow, wireframe or UX section covers it (skip for `api` projects) |
| R7 | Estimate | Missing, or 8+ points |
| R8 | Test map | An AC has no planned test (`standard`/`full` only) |
| R9 | Dependencies | Depends on a story that is not `done` or in the same sprint |
| R10 | Copy | User-facing text needed and undefined (`full` only) |

### Phase 2: Report

One row per story: ID, verdict (`READY` / `NOT READY`), failed checks with a
one-line fix each. Group fixes by owner (`product-manager` for criteria, `ux-lead`
for designs, `lead-backend` for contract gaps).

### Phase 3: Mark ready

For `READY` stories, ask: "Mark these N stories as ready?" On yes, set
`Status: ready` with Edit. `NOT READY` stories stay `draft`.

## Rigor

- `minimal`: R1, R2, R4, R7 only.
- `standard`: R1–R9.
- `full`: all checks; R10 included.

## Next step

`/sprint-plan` when enough stories are ready, or `/dev-story S-NNN`.
