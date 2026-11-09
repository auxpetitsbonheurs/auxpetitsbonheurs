---
name: hotfix
description: "Makes the smallest safe fix for a production bug: a hotfix branch, a failing regression test first, the minimal change, an expedited review and a release-checklist-lite. Use during or after an incident, or for an urgent production bug. Never deploys."
argument-hint: "<bug or incident id / description>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git status*), Bash(git diff*), Bash(git log*), Bash(git switch -c hotfix/*), Bash(git checkout -b hotfix/*)
model: sonnet
---

# Hotfix

Ships the minimum change that fixes a production problem, with a regression
test that proves it. Scope creep is the enemy: refactors and "while we're
here" changes go to `/tech-debt`. The skill prepares a branch and a reviewed
change; the user commits, merges and deploys.

## Inputs

- The incident file (`production/incidents/…`) or bug file (`production/bugs/BUG-NNN-…`), or the user's description
- The failing code area; recent commits
- `project.yaml`: `modes.rigor`, `stack.test_unit`, `stack.test_e2e`

## Phases

### Phase 1: Pin the defect

Restate the bug in one sentence with reproduction steps and the expected
behaviour. If reproduction is unclear, ask; do not guess-fix.

### Phase 2: Branch

Propose `hotfix/<slug>` from the deployed commit (usually `main`). Ask before
creating it. Never work on `main` directly.

### Phase 3: Regression test first

Spawn `test-engineer` (with the relevant specialist) to write a test that
reproduces the bug at the lowest level that can: unit, then integration,
then e2e. Run `bash .claude/scripts/test-run.sh unit` (or `e2e`) and show it
**failing** for the right reason. Under `minimal` rigor a test is strongly
recommended; under `standard`/`full` it is required.

### Phase 4: Minimal fix

The owning specialist proposes the smallest diff. Show it and ask before
writing. Re-run the new test and the full unit suite: `test-run.sh all`.
Report the result honestly.

### Phase 5: Expedited review

Spawn the owning lead (`lead-frontend`/`lead-backend`) to review only the
diff for correctness and side effects; `security-lead` too if the bug is
security-related. Address findings.

### Phase 6: Release checklist lite

- [ ] Regression test fails before, passes after
- [ ] Full test suite, lint and typecheck green
- [ ] No migration, or a backward-compatible one reviewed by `data-engineer`
- [ ] Rollback path known (previous deploy id)
- [ ] Changelog line drafted (`fix: …`)
- [ ] Verification step after deploy written down

Print the commit message (conventional `fix(scope): …`) and the deploy/verify
steps for the user. Update the incident or bug file with the fix reference.

## Output

Branch `hotfix/<slug>` with the approved changes (uncommitted), updated incident/bug file.

## Next step

`/postmortem` if this came from an incident; `/smoke-check` after the user deploys.
