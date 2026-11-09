---
name: refactor
description: "Plans and performs a behaviour-preserving refactor in small steps with the test suite green before, during and after. Use when code is hard to change, duplicated, too large, or when a tech-debt item is scheduled."
argument-hint: "<path | module | TD-NN>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git diff*), Bash(git status*)
model: sonnet
---

# Refactor

Changes structure, never behaviour. The safety net is the test suite: if the
code under refactor is not covered, the first step is writing characterisation
tests.

## Inputs

- The target path/module, or a tech-debt ID from `production/tech-debt.md`
- Tests that cover it (Grep tests for imports of the target)
- `.claude/docs/coding-standards.md`, matching `.claude/rules/`

## Phases

### Phase 1: Baseline

Run `bash .claude/scripts/test-run.sh all`. If it is not green, stop: refactoring on
red hides breakage. Report the failures and suggest fixing them first.

### Phase 2: Coverage check

List the public behaviours of the target (exports, routes, components). For any
without a test, propose **characterisation tests** that pin current behaviour
(even odd behaviour; note it). Ask before writing them, then run them green.

### Phase 3: Plan small steps

Ask the owning lead (`lead-frontend` / `lead-backend`) for a plan of steps that
each keep tests green: rename, extract function/component, move module, inline,
replace conditional with polymorphism/map, split file, introduce a typed
boundary. Show the plan with the expected end shape. Ask "Proceed?"

### Phase 4: Execute

One step at a time: show the edit, ask, apply, run the related tests. On red,
revert that step (re-apply the previous content with Edit) and rethink. Run the
full suite at the end.

### Phase 5: Report

Before/after: file sizes, function lengths, duplication removed, public API
unchanged (or listed changes, with every caller updated). If it came from a
tech-debt item, mark it resolved in `production/tech-debt.md` (ask first).

## Rules

- No behaviour changes, no new features, no dependency upgrades in the same refactor.
- Public contracts (API, component props used across features) change only with
  the contract-change process in `.claude/docs/coordination-rules.md`.

## Next step

`/review-code` on the refactor diff.
