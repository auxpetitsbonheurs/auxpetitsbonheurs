---
name: api-contract
description: "Designs or updates the API contract between frontend and backend: OpenAPI 3.1 for REST, or typed RPC / server-action signatures for tRPC, GraphQL or framework-native stacks; covers errors, pagination, auth and versioning. Use before building endpoints, or when frontend and backend disagree about data shapes."
argument-hint: "<feature-slug | 'all'>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# API Contract

The contract is where frontend and backend meet; neither side changes it alone
(coordination rule 5). `lead-backend` owns it, `lead-frontend` must agree. The
skill writes `docs/architecture/api/openapi.yaml` for REST APIs, or the
`## API Contract` section of the feature spec for RPC, GraphQL or server-action
stacks. It does not implement handlers.

## Inputs

- Argument: a feature slug (`docs/specs/features/<slug>.md`) or `all`
- Existing `docs/architecture/api/openapi.yaml` and other specs' contract sections
- `docs/architecture/data-model.md`, `docs/architecture/architecture.md`, ADRs
- `project.yaml`: `stack.frontend`, `stack.backend`, `stack.auth`
- `.claude/docs/templates/api-contract.yaml`

## Phases

### Phase 1: Choose the contract form

Decide from the stack and architecture (ask if unclear):
- **REST/OpenAPI**: separate backend, public API, mobile clients, or any
  non-TypeScript backend → `openapi.yaml`.
- **Typed RPC** (tRPC, server actions, SvelteKit actions, Remix actions):
  signatures with input/output schemas in the spec section.
- **GraphQL**: schema SDL in `docs/architecture/api/schema.graphql`.

### Phase 2: Draft (backend)

Spawn `lead-backend` with the spec and data model. For each operation:
- Method + path (plural nouns, nested at most one level) or procedure name
- Auth requirement and the permission it checks (role/ownership/tenant)
- Request: params, query, body, each with type, constraints and examples
- Responses: success shape; errors with a consistent body
  (`{ "error": { "code": "VALIDATION_FAILED", "message": "...", "fields": {...} } }`)
  and status codes (400 validation, 401, 403, 404, 409 conflict, 422, 429)
- Pagination (cursor-based: `?cursor=&limit=` → `{ data, nextCursor }`),
  filtering, sorting; max `limit`
- Idempotency (`Idempotency-Key` header) for creates and payments
- Rate limit class; caching headers for public GETs
- Webhooks the system emits or receives, with signature scheme

### Phase 3: Agree (frontend)

Spawn `lead-frontend` with the draft and the spec's UX section. It checks every
screen's data needs are met with no over-fetching, waterfalls or missing
fields, and returns a list of requested changes. Resolve each with the user if
the leads disagree.

### Phase 4: Validate

- OpenAPI: valid 3.1 structure, `operationId` on every operation, shared
  schemas in `components`, examples for each schema. If `npx @redocly/cli` is
  available, offer to run `npx @redocly/cli lint docs/architecture/api/openapi.yaml`
  (ask first; it downloads a package).
- Breaking-change check against the previous version: removed fields, narrowed
  types, new required inputs. Breaking changes need versioning or an
  expand-and-contract plan.

### Phase 5: Approve and write

Show the operations table and the diff. Ask "May I write this to `<path>`?"
Then note in the feature spec that its contract is current.

## Output

`docs/architecture/api/openapi.yaml` (from `.claude/docs/templates/api-contract.yaml`),
`schema.graphql`, or the spec's `## API Contract` section.

## Next step

`/data-model` if storage changes, then `/create-stories`.
