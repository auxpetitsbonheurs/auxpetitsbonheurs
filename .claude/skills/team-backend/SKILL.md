---
name: team-backend
description: "Orchestrates the backend team (lead-backend, api-engineer, data-engineer, the configured backend and data specialists, with a security-lead review) to design and build endpoints, schema changes and jobs from a spec and contract, test-first. Use for an API feature, a backend epic, or a schema-heavy change."
argument-hint: "<feature spec path | epic id | story ids>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Team: Backend

Coordinates a backend delivery from contract to tested code. It never runs
migrations against shared databases and never calls live third-party APIs;
it prints those commands for the user.

## Inputs

- Feature spec + `## API Contract` section or `docs/architecture/api/openapi.yaml`
- `docs/architecture/data-model.md`, relevant ADRs
- Stories in scope (`story-list.sh`)
- `project.yaml`: `stack.backend`, `stack.database`, `stack.orm`, `stack.cache_queue`, `stack.auth`

## Agents

| Agent | Role here |
|---|---|
| `lead-backend` | Plan, contract guardian, final review |
| backend specialist for `stack.backend` (`node-backend-specialist`, `python-backend-specialist`, `go-backend-specialist`, `laravel-specialist`, `rails-specialist`, `baas-specialist`; framework-native stacks use the frontend framework specialist) | Framework idioms |
| data specialist for `stack.database` (`postgres-specialist`, `mongodb-specialist`) | Schema, migrations, queries |
| `api-engineer` | Handlers, domain logic, integration tests |
| `data-engineer` | Data model and migration safety |
| `redis-queue-specialist` (if jobs/cache in scope) | Queues, caching, rate limits |
| `security-lead` | Authz, validation and data-exposure review |

## Phases

### Phase 1: Contract check

Confirm the contract exists and covers every story in scope (endpoints or
actions, request/response shapes, errors, auth, pagination). Missing → stop
and suggest `/api-contract`. Any change to it needs `lead-frontend`'s agreement
and an updated spec.

### Phase 2: Plan (parallel)

Spawn at once:
- `lead-backend`: module layout, domain services, error mapping, file list
- data specialist + `data-engineer`: schema changes, migration plan (expand → migrate → contract when breaking), indexes
- `security-lead`: threat notes for this scope (authz per resource, tenant scoping, rate limits, input limits)

Merge into one plan and ask the user to approve it.

### Phase 3: Build

Migrations first (generated locally, SQL reviewed by `data-engineer`), then
per story: `api-engineer` + specialist write the failing integration test for
an acceptance criterion against the test database, then the handler and
domain code. Ask before every write. Run `test-run.sh unit` (and integration)
after each story.

### Phase 4: Review (parallel)

- `lead-backend`: backend review checklist (validation, authz, transactions, N+1, error codes)
- `security-lead`: `SEC-REVIEW` verdict for the change
- `performance-engineer` if endpoints are on hot paths: query plans and p95 expectations

### Phase 5: Report

Per story: status, tests, findings, the migration commands the user must run
(and where), open items. Report BLOCKED agents explicitly. Ask before
updating story statuses.

## Next step

`/review-code`, then `/story-done`; `/team-frontend` if the UI consumes these endpoints.
