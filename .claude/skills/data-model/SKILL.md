---
name: data-model
description: "Designs or updates the data model: entities, fields, relations, constraints, indexes, tenancy, retention and migration plan, with a mermaid ER diagram, for the configured database (Postgres via Prisma/Drizzle, MongoDB, Supabase, Firebase). Use when a feature adds or changes stored data."
argument-hint: "<feature-slug | 'all'>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Data Model

Produces or updates `docs/architecture/data-model.md`. It designs the schema on
paper first; migrations are written later by `/db-migration`. It never touches
a database.

## Inputs

- Argument: a feature slug or `all`
- `docs/specs/features/*.md` (data needs, permissions, edge cases)
- `docs/architecture/api/openapi.yaml` / contract sections
- Existing `docs/architecture/data-model.md`; for brownfield projects the real
  schema (`prisma/schema.prisma`, `drizzle/**`, `db/schema.rb`, `migrations/**`,
  Django `models.py`, `supabase/migrations/**`)
- `project.yaml`: `stack.database`, `stack.orm`, `privacy.regions`

## Phases

### Phase 1: Gather needs

List the nouns the spec stores, the queries the UX and contract imply (filters,
sorts, lookups by), expected volumes and growth, and the tenancy model (single
user, organisation/workspace, marketplace). Ask about anything unstated that
changes the design (e.g. "can a user belong to several workspaces?").

### Phase 2: Design

Spawn `data-engineer` together with the configured data specialist
(`postgres-specialist`, `mongodb-specialist` or `baas-specialist`, from
`stack.database`). For each entity:
- Fields with types, nullability, defaults; money as integer minor units +
  currency; timestamps `timestamptz` (UTC); IDs (UUIDv7, cuid2 or bigint, per ADR)
- Relations and cardinality; on-delete behaviour
- Constraints: unique, check, foreign keys; invariants enforced in the database
- Indexes derived from Phase 1 queries (composite order explained)
- Tenancy: tenant column on every tenant-owned row + RLS policy or scoped repository
- Personal data classification (none / personal / sensitive) and retention rule
- Soft delete or hard delete + audit, with the reason

For MongoDB: embed vs reference per relation with the access pattern; for
Firebase/Supabase: the security rules / RLS policies required.

### Phase 3: Diagram and plan

- Mermaid `erDiagram` of the affected entities.
- Migration plan for changes to existing tables: expand → backfill → contract
  steps, locking risks on large tables, and backward compatibility with the
  currently deployed code.

### Phase 4: Review

If personal or sensitive data is added and `privacy.regions` is set, ask
`privacy-compliance-specialist` to review retention and lawful basis. Show the
model, diagram and plan.

### Phase 5: Approve and write

Ask "May I write this to `docs/architecture/data-model.md`?" Show only changed
entities on updates.

## Output

`docs/architecture/data-model.md` from `.claude/docs/templates/data-model.md`.

## Next step

`/db-migration` when the story that needs it is in progress, or `/create-stories`.
