# Stage Gates

`/gate-check <stage>` reads this file. A gate decides whether the project may
move from one stage to the next. Each gate lists the **required artifacts**,
the **criteria** each artifact is judged against, and the **signers** (agents
invoked for a verdict). Requirements scale with `modes.rigor`.

## Verdicts

- Overall gate: `PASS`, `CONCERNS` or `FAIL`.
  - `PASS`: every required artifact exists and every signer approved.
  - `CONCERNS`: everything required exists; at least one signer raised
    concerns, or an optional item is missing. The user may advance.
  - `FAIL`: a required artifact is missing, or a signer rejected.
- Signers return only their gate's verdicts (`APPROVE` / `CONCERNS` / `REJECT`)
  or `NOT ASSESSED` naming an input they could not read. A missing required
  artifact is a `FAIL` finding, never `NOT ASSESSED`.
- Under `minimal` rigor the gate is advisory: a `FAIL` is reported but the user
  may still advance after confirming.

## Signers

| Gate ID | Agent | Judges |
|---|---|---|
| `PD-GATE` | `product-director` | Problem, audience, scope and metrics are coherent |
| `TD-GATE` | `technical-director` | Architecture, stack and technical risk |
| `DD-GATE` | `design-director` | Brand, design system, UX quality |
| `QA-RELEASE` | `qa-lead` | Tests, critical journeys, Definition of Done |
| `SEC-LAUNCH` | `security-lead` | Security and dependency audits, secrets, headers |

Which signers run per gate and rigor: see each gate. Under `full` rigor every
listed signer runs; under `standard` the **primary** signer(s) run; under
`minimal` no signer runs (artifact check only).

---

## Gate: discovery → design

| Artifact | minimal | standard | full |
|---|---|---|---|
| `docs/product/brief.md` | required | required | required |
| `docs/product/prd.md` | required (may be short) | required | required |
| `docs/product/personas/*.md` | — | ≥ 1 | ≥ 2, evidence-labelled |
| `docs/product/research/*` (market / competitors) | — | optional | required |
| Scope check note in PRD (`## Scope` with MVP cut) | — | required | required |

Criteria:
- PRD states the problem, target user, success metric (with target), MVP scope and non-goals.
- Every functional requirement is testable (no "fast", "intuitive" without a number or a test).
- MVP fits the capacity the user stated (from `/scope-check`).

Signers: **`PD-GATE` (primary)**; `TD-GATE` under `full` (feasibility of the PRD's non-functional requirements).

## Gate: design → build

| Artifact | minimal | standard | full |
|---|---|---|---|
| `project.yaml` stack keys + `specialists:` | required | required | required |
| `docs/architecture/adr/0001-*.md` (stack ADR) | — | required | required |
| `docs/architecture/architecture.md` | — | required | required |
| `docs/architecture/data-model.md` | — | required if a database is used | required |
| API contract (`docs/architecture/api/openapi.yaml` or each spec's `## API Contract`) | — | required if there is a backend | required |
| `docs/specs/features/*.md` for every MVP feature | ≥ 1 | all MVP features | all MVP features + UX spec section |
| `docs/design/brand-guide.md` (not `api`) | — | required | required |
| `docs/design/design-system.md` + `tokens.json` (not `api`) | — | required | required |
| `docs/design/ux/*.md` for key journeys (not `api`) | — | signup/onboarding + core task | every MVP journey |
| `docs/content/sitemap.md` (not `api`) | — | required for `marketing`/`ecommerce` | required |
| Threat model (`docs/architecture/threat-model.md` or per-spec section) | — | for auth/payments/uploads | required |
| Working prototype of the core journeys (`prototypes/*/README.md` with `Type: working-prototype`; `api` projects: contract mock server) | recommended | required | required, ≥ 1 `iterate` round |
| Manual test session on the prototype (`production/test-sessions/*.md`) with every S1/S2 finding routed | recommended | ≥ 1 | ≥ 2 sessions, ≥ 3 testers |

Criteria:
- Every PRD MVP requirement maps to a feature spec (traceability).
- Specs, API contract and data model agree (names, fields, errors).
- Architecture respects `project.yaml → budgets` (rendering strategy, JS budget).
- Designs cover loading/empty/error states and meet `a11y.standard` contrast.

Signers: **`TD-GATE` (primary)**, **`DD-GATE` (primary, skipped for `api`)**; `PD-GATE` under `full`.

## Gate: build → launch

| Artifact | minimal | standard | full |
|---|---|---|---|
| All MVP stories `Status: done` (`story-list.sh`) | required | required | required |
| Test suite passes (`test-run.sh all`) | required | required | required |
| E2E coverage of critical journeys named in the PRD | — | required | required |
| CI pipeline in repo (`.github/workflows/` or host CI) | — | required | required |
| `production/tech-debt.md` reviewed (no `blocker` items) | — | required | required |
| `/consistency-check` report with no open contradictions | — | optional | required |
| Manual test session on a preview/staging build covering the critical journeys, no open S1 findings | — | required | required (UAT, signed by `qa-lead` + `product-director`) |

Criteria:
- No skipped/disabled tests without a linked bug.
- Lint and typecheck clean.
- Acceptance criteria in done stories each map to a passing test.

Signers: **`QA-RELEASE` (primary)**, `TD-GATE` under `full`.

## Gate: launch → grow

| Artifact | minimal | standard | full |
|---|---|---|---|
| `production/audits/perf-*.md` within budgets | required | required | required |
| `production/audits/security-*.md` no open high/critical | required | required | required |
| `production/audits/a11y-*.md` no open serious/critical | — | required | required |
| `production/audits/seo-*.md` (not `api`) | — | required | required |
| `production/audits/deps-*.md` | — | optional | required |
| `production/audits/privacy-*.md` (when `privacy.regions` set or personal data collected) | — | required | required |
| `production/releases/*/checklist.md` launch checklist complete | required | required | required |
| Observability: error tracking + uptime check configured | — | required | required |
| Backups + rollback runbook | — | required | required |
| Smoke check against production URL passed | required | required | required |

Audit reports older than 14 days, or older than the last release, count as missing.

Signers: **`SEC-LAUNCH` (primary)**, **`QA-RELEASE` (primary)**; `PD-GATE`, `TD-GATE`, `DD-GATE` under `full`.

## Report format (`production/gates/<stage>-YYYY-MM-DD.md`)

```markdown
# Gate: <stage> → <next>   (YYYY-MM-DD, rigor: <rigor>)
Verdict: PASS | CONCERNS | FAIL

## Artifacts
| Artifact | Required | Found | Notes |

## Signer verdicts
| Gate ID | Agent | Verdict | Key points |

## Blocking findings
## Concerns
## Next steps
```
