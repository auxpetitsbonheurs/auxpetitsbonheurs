---
name: smoke-check
description: "Fast post-deploy or local smoke test: health endpoints plus the critical user journeys (load home, sign up or log in, core task, checkout if any) in Playwright, with console-error and failed-request capture. Use right after a deploy, before a release, or to check that a local build basically works."
argument-hint: "[url | 'local']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npx playwright*), Bash(curl -s*)
model: sonnet
---

# Smoke Check

Answers one question in under five minutes: "Is the deployed (or locally
built) app basically working?" It is read-only against production: it uses a
dedicated test account, never creates real orders or charges, and never sends
email to real people.

## Inputs

- Argument: a URL (preview, staging, production) or `local` (start the production build per `.claude/docs/stack-matrix.md`)
- PRD critical journeys and `tests/e2e/` (an existing `@smoke` tag is reused)
- `project.yaml`: `stack.payments`, `stack.auth`

## Phases

### Phase 1: Health

`curl -s -o /dev/null -w '%{http_code} %{time_total}'` on the home page, the
health endpoint (`/api/health` or the documented one), `robots.txt` and
`sitemap.xml` (sites). Anything not 200, or slower than 3 s, is reported first.

### Phase 2: Journeys

If e2e tests tagged `@smoke` exist, run `npx playwright test --grep @smoke`
with `BASE_URL=<url>`. Otherwise, after approval, generate
`tests/e2e/smoke.spec.ts` covering (as the project has them):
1. Home renders, main heading visible, no console errors.
2. Log in with the smoke test account from env vars (`SMOKE_USER_EMAIL`, `SMOKE_USER_PASSWORD`, never hard-coded); land on the dashboard.
3. Perform the core task read-only or with clearly marked test data, then clean it up.
4. Checkout up to the payment provider's page only (on production), or complete it with test cards on preview/staging.
5. Log out.

For each page, capture console errors and failed network requests (4xx/5xx,
blocked mixed content).

If `webapp-testing` (anthropics/skills) is installed, use it to drive the
running app; with Playwright MCP, use that for interactive debugging of a
failure. If neither is present, say so and use plain Playwright.

### Phase 3: Result

Report `PASS` or `FAIL` with: health table, journey results, console errors,
failed requests, trace paths for failures. On production `FAIL`, point to the
rollback step in `production/releases/runbook.md` and suggest `/incident`.
Append the result to `production/session-state/active.md`.

## Output

Chat report; on request, `production/releases/<version>/smoke.md`. Optional
new spec `tests/e2e/smoke.spec.ts` (asked first).

## Next step

`PASS` → `/release-notes`. `FAIL` on production → `/incident`.
