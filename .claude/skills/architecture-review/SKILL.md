---
name: architecture-review
description: "Reviews the architecture document, ADRs, data model and API contract against the PRD, feature specs and project.yaml budgets, checks they agree with each other, and returns a TD-ARCH verdict with findings. Use before the design gate, after major ADRs, or when the code seems to drift from the architecture."
argument-hint: "[optional: 'code' to also compare with the codebase]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: opus
---

# Architecture Review

Read-only review that writes only its report. It returns gate `TD-ARCH`
(Verdicts: `APPROVE` / `CONCERNS` / `REJECT`, or `NOT ASSESSED` naming an
unreadable input). A missing architecture document is a `REJECT` finding, not a
missing input.

## Inputs

- `docs/architecture/architecture.md`, all ADRs, `data-model.md`, `api/openapi.yaml`
- `docs/product/prd.md` (non-functional requirements), `docs/specs/features/*.md`
- `project.yaml`: `stack.*`, `budgets`, `a11y`, `privacy.regions`
- With `code`: `bash .claude/scripts/detect-stack.sh` and the code root

## Phases

### Phase 1: Collect

Read each input by section. List what exists and what is missing.

### Phase 2: Review in parallel

Spawn in parallel, each with the input paths and the questions for their lens:
- `technical-director`: completeness against the template; every expensive
  decision has an ADR; ADRs do not contradict each other or `project.yaml → stack`;
  simplicity (no component without a stated need).
- `lead-backend`: contract ↔ data model ↔ specs agree (every field the
  contract returns is stored or derived; every spec operation has a contract entry).
- `lead-frontend`: rendering strategy and data fetching fit the UX and budgets.
- `security-lead`: trust boundaries, authz model, tenancy, secrets, webhook and
  upload handling, rate limits.
- `performance-engineer`: budgets in `project.yaml` are achievable with the
  chosen rendering, caching and third-party scripts.
- With `code`: `lead-frontend` and `lead-backend` also report where the code
  diverges (a second ORM, unrecorded framework, routes bypassing the auth layer).

### Phase 3: Verdict

Merge findings into: | ID | Severity | Area | Finding | Evidence (file:section) | Recommendation |
- `REJECT`: architecture missing, or a Critical finding (e.g. no authz model,
  a requirement the design cannot meet).
- `CONCERNS`: High findings, or decisions recorded nowhere.
- `APPROVE`: only Medium/Low findings.

### Phase 4: Write

Ask "May I write the report to `production/audits/architecture-review-YYYY-MM-DD.md`?"

## Output

A review report in `production/audits/` with the `TD-ARCH` verdict on its first line.

## Next step

Fix findings via `/architecture-decision` or `/create-architecture update`,
then `/gate-check design`.
