---
name: e2e
description: "Writes and runs Playwright end-to-end tests for a user journey: role-based locators, auth storage state, test data setup, axe accessibility checks, mobile viewport, and trace debugging. Uses the webapp-testing skill and Playwright MCP when installed. Use for testing a journey through the real app."
argument-hint: "<journey description | J-NN | S-NNN>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npx playwright test*), Bash(npx playwright show-report*)
model: sonnet
---

# E2E

Tests the product the way a user uses it. Runs against the local dev server
(Playwright `webServer`) or a preview URL; never against production unless the
user explicitly asks and the test is read-only.

## Inputs

- The journey (argument), a `J-NN` from `tests/e2e/CRITICAL-JOURNEYS.md`, or a
  story's e2e ACs
- `playwright.config.*` (run `/test-setup e2e` first if missing)
- The UX flow in `docs/design/ux/` for expected steps and states
- If installed: `webapp-testing` (anthropics/skills) for driving the app;
  Playwright MCP for exploring the page interactively. Otherwise say so and continue.

## Phases

### Phase 1: Script the journey

List steps and assertions, including one failure path (invalid input, no
permission). Decide data setup: API/DB seeding helpers or fixtures, never UI
clicks for setup that isn't under test. Logged-in journeys reuse a storage state
from a setup project.

### Phase 2: Explore (optional)

If Playwright MCP or `webapp-testing` is available, open the page, read the
accessibility tree, and confirm the roles and names to target.

### Phase 3: Write

`tests/e2e/<journey-slug>.spec.ts`:
- locators: `getByRole`, `getByLabel`, `getByText` for content; `data-testid` only as last resort
- web-first assertions (`await expect(locator).toBeVisible()`); no `waitForTimeout`
- `checkA11y`/`AxeBuilder` on each key page; fail on serious/critical violations
- a mobile project run for P0 journeys
- tag `@p0` or `@journey:J-NN`

Ask before writing.

### Phase 4: Run and debug

`npx playwright test tests/e2e/<file>` → report. On failure, open the trace,
identify whether it's a product bug (→ `/bug-report`) or a test bug (→ fix), and
say which.

## Next step

`/regression-suite review` to update journey coverage.
