---
name: tdd
description: "Runs a strict red-green-refactor loop for one acceptance criterion or behaviour: write the failing test, show the failure, write the minimum code, show it passing, refactor with tests green. Use inside /dev-story, or whenever the user wants to build or fix behaviour test-first."
argument-hint: "<S-NNN AC#> | <behaviour description>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Bash(bash .claude/scripts/*), Bash(npx vitest run*), Bash(npx jest*), Bash(pytest*), Bash(go test*), Bash(npx playwright test*)
model: sonnet
---

# TDD

One behaviour at a time, three steps, each shown to the user. The rule: **no
production code is written until a test has been seen failing for the right
reason.**

## Inputs

- The AC (Given/When/Then) or the behaviour description
- The story's `## Tests` map for the planned test location
- `.claude/docs/stack-matrix.md` for the test runner and conventions
- `.claude/rules/test-standards.md`

## Phases

### Phase 1: Choose the test level

| Behaviour | Level | Example |
|---|---|---|
| Pure rule (pricing, validation, permissions logic) | unit | `tests/unit/pricing.test.ts` |
| Endpoint / server action / query | integration (real test DB) | `tests/integration/projects.test.ts` |
| Component behaviour | component (Testing Library) | `src/components/__tests__/InviteForm.test.tsx` |
| User journey across pages | e2e (Playwright) | `tests/e2e/signup.spec.ts` |

Pick the lowest level that proves the AC. Name the test after the behaviour,
not the function (`rejects an expired reset token`).

### Phase 2: Red

Write the test, then ask to write it ("May I write this test to `<path>`?").
Run only that test. Show the failure output. It must fail **because the
behaviour is missing**: an import error or typo is not a valid red; fix the test
and run it again.

### Phase 3: Green

Write the **minimum** code that makes the test pass. No extra features, no
speculative abstractions. Show the diff, ask before writing, run the test, show
it passing.

### Phase 4: Refactor

With the test green, improve names, remove duplication, extract functions
(standards: ≤ 40 lines, complexity ≤ 10). Run the related tests after each change.
Skip if nothing needs it; say so.

### Phase 5: Repeat or finish

Next AC → Phase 1. When all are done, run the full suite
(`bash .claude/scripts/test-run.sh all`) and report.

## Rules

- Deterministic tests: fixed clock, seeded data, mocked third-party HTTP (MSW,
  respx, httptest), never real payment, email or AI calls.
- Query UI by role and label; never by CSS class.
- Never change a test's expectation to make code pass unless the spec changed;
  then say so and update the spec too.

## Rigor

Under `minimal`, `/tdd` is opt-in and the hook only warns. Under `full`, the
`tdd-guard` hook blocks source changes without a matching test change.

## Next step

Back to `/dev-story` Phase 4, or `/story-done`.
