---
name: regression-suite
description: "Maintains the list of critical user journeys (signup, login, checkout, core task, billing changes) and checks their Playwright coverage, finding gaps and writing missing tests. Use before a release, after a bug escaped to production, or when the e2e suite is thin."
argument-hint: "['review' | 'fill']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npx playwright test*)
model: sonnet
---

# Regression Suite

The journeys that must never break, and proof they don't. Keeps
`tests/e2e/CRITICAL-JOURNEYS.md` and the Playwright specs aligned.

## Inputs

- PRD (key flows, success metrics), `docs/design/ux/` flows
- `tests/e2e/**` and the existing `CRITICAL-JOURNEYS.md`
- `production/bugs/` and `production/incidents/` (escaped defects become journeys or cases)

## Phases

### Phase 1: The list

With `qa-lead`, derive journeys by project type:
- SaaS: sign up → verify → onboard → create first item; log in/out; reset password;
  invite teammate; upgrade plan; cancel
- E-commerce: browse → product → add to cart → checkout (test card) → order confirmation;
  guest checkout; out-of-stock
- Marketing: home → key CTA → lead form submit; navigation; 404
- API: auth token → core create/read/update/delete; rate limit response
Each journey: ID, steps, owner, priority (P0 must run on every PR).

### Phase 2: Coverage

Map journeys to specs (Grep test titles/tags such as `@journey:J-03`). Report:
covered, partial (missing failure path or mobile viewport), missing.

### Phase 3: Fill (`fill`)

For each gap, brief `test-engineer` to write the test (via `/e2e`). Ask before
writing each file. Tag P0 tests `@p0` so CI can run them on every PR.

### Phase 4: Run

`npx playwright test --grep @p0` (or the full suite) and report results.

## Output

`tests/e2e/CRITICAL-JOURNEYS.md`, new/updated `tests/e2e/*.spec.ts`.

## Next step

`/ci-setup` to run `@p0` on every PR, or `/release-checklist`.
