---
name: reverse-document
description: "Generates studio documents (PRD, feature specs, architecture, data model, API contract, ADRs) from an existing codebase by spawning specialist agents in parallel, marking every inferred statement. Use after /adopt on a brownfield project, or when code exists without docs."
argument-hint: "[all | prd | specs | architecture | data-model | api | adrs]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git log*)
model: opus
---

# Reverse-document an existing codebase

Reads the code and writes the documents the rest of the studio expects, so
`/feature-spec`, `/dev-story` and the gates have something to work from. Every
statement the code does not prove is marked `[inferred]`, and every gap is
marked `[TO CONFIRM]`. It never changes application code.

## Inputs

- `project.yaml` (run `/adopt` first if stack keys are empty: stop and say so)
- `paths.code_root`, the routes, handlers, schema/migrations, tests, README
- `git log` for decision archaeology
- Templates: `prd`, `feature-spec`, `architecture`, `data-model`, `adr`, `api-contract.yaml`
- Argument: limit to one document family (default `all`)

## Phases

### Phase 1: Plan

Inventory with Glob: route files, API handlers, schema files, integration SDK
imports, test files. Show the plan: which documents will be generated, by which
agent, at which path. Under `modes.automation: ask`, ask "Generate these?"
once for the whole set (paths listed); the agents then write the named paths.

Never overwrite an existing doc: if the path exists, write
`<name>.reverse.md` beside it and say so.

### Phase 2: Generate in parallel

Spawn independent agents together (one message, several Agent calls):

| Agent | Output |
|---|---|
| `lead-backend` (+ configured backend specialist) | `docs/architecture/api/openapi.yaml` (or a `## API Contract` per spec for server-action/RPC stacks) |
| `data-engineer` (+ configured data specialist) | `docs/architecture/data-model.md`: entities, relations, constraints, indexes, from schema/migrations |
| `technical-director` | `docs/architecture/architecture.md` + ADRs for decisions evident in code (framework, DB, auth provider, hosting) as `docs/architecture/adr/NNNN-<slug>.md` with `Status: Accepted (reverse-documented)` |
| `product-manager` | `docs/specs/features/<slug>.md` per user-facing feature area found in routes |

Brief each with: the code paths to read, the template, the exact output path,
"mark unproven claims `[inferred]` and unknowns `[TO CONFIRM]`, cite file paths
for every behaviour", and "do not modify code".

Use `bash .claude/scripts/next-number.sh docs/architecture/adr` for ADR numbers.

### Phase 3: PRD (after Phase 2)

Spawn `product-manager` with the feature specs and README to draft
`docs/product/prd.md`. The problem, audience and metrics usually cannot be
read from code: leave them `[TO CONFIRM]` and list them as questions.

### Phase 4: Review

Report: documents written, the number of `[inferred]` and `[TO CONFIRM]`
markers in each, contradictions found (e.g. tests asserting behaviour the
routes no longer have), and the top questions for the user. Append a line to
`production/session-state/active.md`.

## Output

Docs under `docs/product/`, `docs/specs/features/`, `docs/architecture/`.

## Rigor

- `minimal`: architecture + data model only unless asked.
- `full`: also a threat model draft (`security-lead`) for auth, payments and uploads.

## Next step

Answer the `[TO CONFIRM]` questions, then `/project-stage-detect` and `/help`.
