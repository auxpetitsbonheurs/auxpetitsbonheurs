---
name: consistency-check
description: "Cross-checks that the PRD, feature specs, API contract, data model, stories, ADRs and the code agree: every requirement has a spec and stories, every contract endpoint exists in code and vice versa, and every entity matches the schema. Reports drift. Use before a gate, after a big change, or when things feel out of sync."
argument-hint: "[scope: 'all' | feature-slug]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Bash(bash .claude/scripts/*)
model: sonnet
---

# Consistency Check

Finds drift between documents and code. It reports and writes a report file; it
never "fixes" docs or code itself. Fixes go through `/propagate-design-change`
or the owning skill.

## Inputs

- `docs/product/prd.md`, `docs/specs/features/*.md`, `docs/architecture/api/*`,
  `docs/architecture/data-model.md`, `docs/architecture/adr/*`
- `production/epics/`, `production/stories/`
- Code: routes (`app/**/page.*`, `app/**/route.*`, `pages/`, `src/routes/`, `routes/`,
  `server/api/`, `urls.py`, `routes/web.php`, `config/routes.rb`), schema files
  (`prisma/schema.prisma`, `drizzle/*`, models)

## Checks

| ID | Check |
|---|---|
| C1 | Every PRD requirement (FR-/NFR-) is traced by at least one spec |
| C2 | Every spec traces back to a PRD requirement (no orphan features) |
| C3 | Every spec requirement has at least one story; every story links an existing spec anchor |
| C4 | Every endpoint/action in the contract exists in code, with matching method and path |
| C5 | Every API route in code is in the contract (undocumented endpoints) |
| C6 | Every entity/field in the data model exists in the schema with the same type/nullability, and vice versa |
| C7 | Accepted ADRs are reflected in `project.yaml → stack` and the code (e.g. ADR says Drizzle, code imports Prisma) |
| C8 | Stories marked `done` have their ACs ticked and tests that exist |
| C9 | Sitemap pages exist as routes (marketing/e-commerce projects) |
| C10 | Terms are used consistently (entity names in PRD, specs, UI copy, code) |

## Phases

1. Gather inventories with Glob/Grep (observations).
2. Run the checks in scope; under `modes.rigor: minimal` run C1, C3, C4, C6 only.
3. Report: a table per check with `OK` or each mismatch (`docs/specs/features/billing.md#api ↔ app/api/billing/route.ts: spec says POST /billing/portal, code has GET`), and the owner who should resolve it.
4. Ask before writing the report to `production/audits/consistency-YYYY-MM-DD.md`.

## Next step

`/propagate-design-change` for spec-side fixes; `/dev-story` or a new story for code-side fixes.
