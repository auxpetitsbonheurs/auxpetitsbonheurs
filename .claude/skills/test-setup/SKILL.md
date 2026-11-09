---
name: test-setup
description: "Sets up the project's test infrastructure for its stack: unit/component runner, integration tests against a real test database (Docker Compose), Playwright e2e with axe, coverage, fixtures and CI-ready scripts. Use after /setup-stack, when tests are missing, or when the test setup is broken."
argument-hint: "[unit | integration | e2e | all]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Test Setup

Gives the project the three test layers the TDD workflow needs, with commands
that run identically on a laptop and in CI.

## Inputs

- `project.yaml → stack.*`, `stack.test_unit`, `stack.test_e2e`
- `.claude/docs/stack-matrix.md`: the runner, commands and conventions per stack
- Existing config (`vitest.config.*`, `jest.config.*`, `pytest.ini`/`pyproject.toml`,
  `playwright.config.*`, `phpunit.xml`, `.rspec`)
- `bash .claude/scripts/detect-stack.sh` to confirm what is installed

## Phases

### Phase 1: Inventory

Report what exists and what is missing per layer. If `stack.test_unit` is null,
recommend the matrix default (Vitest for Vite/TS stacks, Jest only if already present,
pytest, `go test`, Pest/PHPUnit, RSpec/Minitest) and set it after approval.

### Phase 2: Plan

Spawn `test-engineer` to propose:
- **Unit/component**: runner config, Testing Library for UI, path aliases matching
  the app, `tests/unit/` and colocated component tests
- **Integration**: `docker-compose.test.yml` with Postgres (and Redis if used) on
  non-default ports; per-run database (or per-worker schema) with migrations applied;
  factories/fixtures; MSW/respx/httptest for third-party HTTP
- **E2E**: `playwright.config.ts` with `webServer` starting the app, `baseURL` from
  `BASE_URL`, traces on first retry, projects for chromium (+ mobile viewport);
  `@axe-core/playwright` helper; auth storage-state setup
- **Scripts**: `test`, `test:unit`, `test:integration`, `test:e2e`, `test:coverage`
  (or Makefile/composer/rake equivalents) so `bash .claude/scripts/test-run.sh` finds them
- Coverage thresholds by rigor (`minimal` none, `standard` 70% lines on `src/` logic,
  `full` 80% + changed-lines coverage in CI)

Show the file list and ask.

### Phase 3: Write and verify

Write each file after approval. Install commands (e.g. `pnpm add -D vitest
@testing-library/react @playwright/test @axe-core/playwright`) are printed for the
user to run or approved individually. Add one smoke test per layer and run
`bash .claude/scripts/test-run.sh all`; show the result.

## Next step

`/ci-setup` to run these in CI, or `/dev-story`.
