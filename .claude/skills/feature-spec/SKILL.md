---
name: feature-spec
description: "Writes a complete feature specification (requirements traced to the PRD, UX screens and states, API contract, data model changes, permissions, analytics, edge cases, acceptance criteria and non-functional requirements) with product, UX, frontend and backend leads in parallel. Use before building any feature."
argument-hint: "<feature name>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: opus
---

# Feature Spec

Produces `docs/specs/features/<feature-slug>.md`: the single document a story
is built and tested from. Four leads draft their sections in parallel; the skill
merges them, resolves conflicts with the user, and runs a feasibility check. It
does not create stories (`/create-stories`) or code.

## Inputs

- Argument: the feature. Without one, list PRD features without a spec and ask.
- `docs/product/prd.md` (the requirement IDs this feature implements)
- `docs/design/ux/*.md` flows and wireframes for it; `docs/design/design-system.md`
- `docs/architecture/architecture.md`, ADRs, `docs/architecture/data-model.md`,
  `docs/architecture/api/openapi.yaml` (existing contracts)
- `project.yaml`: `stack.*`, `budgets`, `a11y`, `i18n`, `privacy.regions`

If no PRD exists, suggest `/write-prd` and stop.

## Phases

### Phase 1: Frame

From the PRD, state the feature's goal, the requirement IDs it covers, the
persona, and what is out of scope. Ask the user to confirm and to answer any
open product question the PRD leaves (max 4 questions).

### Phase 2: Draft sections in parallel

Spawn all four at once, each with the frame, the input paths and the section
headings they own (from `.claude/docs/templates/feature-spec.md`):
- `product-manager`: Summary; Requirements & user stories (traced to PRD IDs);
  Acceptance criteria (Given/When/Then, including failures); Analytics events
  (with `analytics-engineer` naming); Open questions.
- `ux-lead`: UX: screens, states (loading/empty/error/success/permission),
  interactions, validation, copy needs, accessibility notes; link the flow doc.
- `lead-frontend`: Frontend approach: routes, components (design-system names),
  data fetching and caching, client state, performance budget impact.
- `lead-backend`: API Contract (endpoints/actions, request/response, errors,
  pagination, auth); Data model changes; Permissions matrix (role × action ×
  resource, tenant scoping); background jobs; third-party integrations.

### Phase 3: Merge and resolve

Merge into one document. Check the frontend's data needs against the backend's
contract field by field; list every mismatch and conflict as a question for
the user, with each lead's recommendation. Add:
- **Edge cases**: concurrency, duplicates, limits, deletion, time zones, i18n.
- **Non-functional**: performance (budgets from `project.yaml`), accessibility
  (WCAG 2.2 AA items), security (authz, input validation, rate limits; ask
  `security-lead` if it touches auth, money, files or personal data), privacy
  (personal data collected, retention, consent; `privacy-compliance-specialist`
  when `privacy.regions` is set).

### Phase 4: Feasibility

Spawn `technical-director` for gate `TD-FEASIBILITY` with the merged spec.
Report the verdict. On `CONCERNS`, show them with the proposed alternatives and
let the user decide before continuing.

### Phase 5: Approve and write

Show the spec (or a section-by-section summary) and ask
"May I write this to `docs/specs/features/<feature-slug>.md`?" If the contract
introduces new endpoints, offer `/api-contract` to update `openapi.yaml`.

## Output

`docs/specs/features/<feature-slug>.md` from `.claude/docs/templates/feature-spec.md`.

## Rigor

- `minimal`: product + UX + contract sections; feasibility check skipped unless risky.
- `standard`: all sections; feasibility check.
- `full`: as standard, plus `security-lead` review for every spec and
  `product-director` sign-off (`PD-SCOPE`) when scope grew beyond the PRD.

## Next step

`/api-contract` and `/data-model` if those changed, then `/create-stories`.
