---
name: create-architecture
description: "Writes the system architecture document with the technical director: rendering strategy, module and service boundaries, auth model, data flow, integrations, deployment topology, environments, observability and risks. Use after the stack is chosen and the PRD exists, before building features."
argument-hint: "[optional: 'update']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: opus
---

# Create Architecture

Produces `docs/architecture/architecture.md`: how the system is built, in one
document a new contributor can read in fifteen minutes. Decisions it needs that
are expensive to reverse become ADRs via `/architecture-decision`.

## Inputs

- `docs/product/prd.md` (functional and non-functional requirements)
- `docs/specs/features/*.md` (if any yet), `docs/content/sitemap.md`
- ADRs in `docs/architecture/adr/`; `docs/architecture/data-model.md`
- `project.yaml`: all of `stack`, `budgets`, `a11y`, `i18n`, `privacy`, `project.type`
- For brownfield: `bash .claude/scripts/detect-stack.sh` and the code layout

If the stack is not set, suggest `/setup-stack` and stop.

## Phases

### Phase 1: Requirements that shape the architecture

Extract from the PRD and `project.yaml`: expected users and traffic, data
sensitivity, regions, uptime expectation, budgets, integrations, offline/mobile
needs, realtime needs, and the team (solo). Ask about any that are unknown.

### Phase 2: Draft in parallel

Spawn `technical-director` (overall shape and trade-offs) with `lead-frontend`,
`lead-backend`, `devops-lead` and `security-lead` in parallel, each drafting their
sections of `.claude/docs/templates/architecture.md`:
- **Context**: system context diagram (mermaid `flowchart`): users, the app,
  third-party services.
- **Rendering strategy** per route group (static, ISR, SSR, client), with reasons.
- **Code organisation**: monolith/modular monolith/monorepo; module boundaries
  by domain; where business logic lives; shared types and the contract.
- **Data**: system of record, caches, queues, search, file storage; data flow
  for the key journeys (sequence diagram for the most complex one).
- **Auth model**: provider, session type, authorisation layer, tenancy.
- **Integrations**: payments, email, CMS, AI, analytics: how each is called,
  failure handling, webhook paths.
- **Deployment**: hosting, environments (local, preview, staging?, prod),
  CI/CD flow, migrations step, secrets management, backups.
- **Observability**: errors, logs, metrics, uptime, alert routing.
- **Security**: trust boundaries, headers/CSP, rate limits, threat-model summary.
- **Performance**: how budgets are met (caching, CDN, bundles).
- **Risks and open decisions**: each with owner and the ADR or spike that resolves it.

### Phase 3: Reconcile

Merge, remove contradictions, and check each decision matches an ADR or is
listed as needing one. Present open decisions to the user and offer to run
`/architecture-decision` for each, one at a time.

### Phase 4: Approve and write

Show the document and ask "May I write this to `docs/architecture/architecture.md`?"

## Output

`docs/architecture/architecture.md` from `.claude/docs/templates/architecture.md`.

## Rigor

- `minimal`: context, rendering, code organisation, deployment, risks.
- `standard`: all sections.
- `full`: all sections, plus a threat model (`.claude/docs/templates/threat-model.md`)
  by `security-lead`, and `/architecture-review` before Build.

## Next step

`/architecture-review`, then `/gate-check design`.
