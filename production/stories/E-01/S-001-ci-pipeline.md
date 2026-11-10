# S-001: CI pipeline with lint, types, tests, build and JS budget
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/architecture/architecture.md#environments
Estimate: 3 pts
Owner: devops-lead, test-engineer

## Story
As the bakery's developer, I want every pull request and every push to main checked automatically, so that broken or over-budget code never reaches staging.

## Acceptance Criteria
- [ ] AC1 (NFR-012): Given a pull request or a push to main, when GitHub Actions runs, then lint, typecheck, unit tests and build run in that order, and a failure in any step marks the run failed.
- [ ] AC2 (NFR-001): Given a build where one route's initial JavaScript is over 170 kB gzipped, when the budget check runs, then CI fails and the output names the route and its size; given every route at or under 170 kB, then the check passes.
- [ ] AC3 (NFR-012): Given a clean checkout with no secrets and no network access to third parties, when `npm ci && npm test` runs, then the unit tests pass (the test job references no `secrets.*`).
- [ ] AC4 (NFR-012): Given the README, then it has the headings "What this is", "Services and accounts", "Run locally", "Deploy", "Secrets", "Backups" (content filled by S-002 and S-020), so ownership documentation exists from day one.
- [ ] AC5 (NFR-012): Given the budget limit is read from `project.yaml` (`budgets.js_initial_kb`), when the value changes, then the check uses the new value without code changes.

## Tests
- AC1 → .github/workflows/ci.yml (proved by one run on a deliberately failing branch; link recorded in the PR)
- AC2 → src/app/lib/js-budget.test.ts (pure `checkBudgets(chunks, limitKb)`)
- AC3 → src/app/lib/ci-config.test.ts (reads ci.yml, asserts no `secrets.` in the test job)
- AC4 → src/app/lib/readme.test.ts
- AC5 → src/app/lib/js-budget.test.ts

## Notes
- Depends on: none.
- Playwright job is added by S-005; deploy is S-002.
- Architecture "Environments": CI = lint, typecheck, unit tests, build + JS-budget check, Playwright on PRs and main.
- Decision: the budget script lives in `src/app/lib` (not `scripts/`) so vitest's include pattern covers its test.
