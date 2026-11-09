---
name: test-flakiness
description: "Finds and fixes flaky tests: reruns suspects to measure flake rate, diagnoses causes (timing, shared state, order dependence, network, clocks, animations) and proposes root-cause fixes. Use when CI fails intermittently or a test passes on retry."
argument-hint: "[test path or name]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npx vitest run*), Bash(npx playwright test*), Bash(pytest*), Bash(go test*)
model: sonnet
---

# Test Flakiness

A flaky test is a bug in the test or in the product. It is never fixed by
deleting it, skipping it silently, or bumping a timeout without a reason.

## Inputs

- The suspect test(s), or CI history the user pastes
- Test config (retries, parallelism, timeouts)
- Playwright traces in `test-results/` if present

## Phases

### Phase 1: Measure

Rerun the suspect N times in isolation and in the full suite, e.g.
`npx playwright test <file> --repeat-each=20`, `npx vitest run <file>` in a loop,
`pytest -p no:randomly <file>` vs `pytest -p randomly`, `go test -count=20 -race`.
Report the failure rate alone vs in the suite (suite-only failures point to shared state).

### Phase 2: Diagnose

`test-engineer` checks the usual causes:

| Symptom | Likely cause | Fix |
|---|---|---|
| Passes alone, fails in suite | shared DB rows, global mocks, module state | per-test data, reset mocks, isolate workers |
| Fails on slow CI | fixed sleeps, racing async UI | web-first assertions, wait for network idle / response |
| Fails near midnight/month end | real clock | fake timers / fixed `Date` |
| Random order failures | order dependence | make each test self-sufficient |
| Animation/screenshot diffs | transitions, fonts | disable animations, wait for fonts |
| External calls | real network | mock at the boundary |

Use the trace (`npx playwright show-trace`) for e2e failures.

### Phase 3: Fix

Propose the root-cause fix with the evidence. Ask before editing. Rerun the
measurement; it must reach 0 failures in the same number of runs.

If it cannot be fixed now: quarantine **only** with the user's approval, a
`TODO(owner, date)` comment and a tech-debt entry (`/tech-debt add`).

## Next step

Back to the work CI was blocking.
