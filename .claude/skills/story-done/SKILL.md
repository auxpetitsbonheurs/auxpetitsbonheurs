---
name: story-done
description: "Closes a story: verifies the Definition of Done for the project's rigor (every acceptance criterion has a passing test, checks green, review done, spec updated), marks it done and suggests a commit message. Use when a story in review is believed finished."
argument-hint: "<S-NNN>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(git status*), Bash(git diff*), Bash(git log*)
model: sonnet
---

# Story Done

Runs the `QA-STORY` gate with `qa-lead` and, on `PASS`, sets the story to
`done`. It suggests a conventional commit message but never commits.

## Inputs

- The story file (must be `review`; `in-progress` → suggest `/dev-story` first)
- The test files named under `## Tests`
- The latest `/review-code` notes, if any
- The spec sections the story implements
- `modes.rigor`

## Phases

### Phase 1: Evidence

1. Run `bash .claude/scripts/test-run.sh all` and the stack's lint and typecheck
   commands (`.claude/docs/stack-matrix.md`).
2. For each AC, find its test (Grep the test file for the AC ID or the behaviour)
   and confirm it ran and passed. An AC with no test is a finding.
3. Compare built behaviour with the spec. If they differ, list the differences.

### Phase 2: Gate

Spawn `qa-lead` with the evidence and the Definition of Done for the rigor
(below). Verdict: `PASS`, `CONCERNS` or `FAIL`, with reasons.

| Check | minimal | standard | full |
|---|---|---|---|
| Every AC has a passing automated test | recommended | required | required |
| Lint + typecheck pass | required | required | required |
| Full unit + integration suite passes | required | required | required |
| Affected critical journeys pass (Playwright) | - | required | required |
| No new axe violations on changed pages | - | required | required |
| Code review done, findings resolved | - | recommended | required |
| Spec updated to match behaviour | required | required | required |

### Phase 3: Close

- `FAIL`: list what to fix; status stays `review`.
- `CONCERNS`: show them; ask whether to close anyway (not allowed under `full`).
- `PASS`: if the spec must change, show the edit and ask before applying it.
  Then ask "Mark S-NNN done?" On yes, set `Status: done`, tick all ACs,
  update the epic's story list and the checkpoint.

Suggest a commit message, e.g. `feat(accounts): reset password by email (S-007)`,
and say: "Commit when you're ready; I won't commit for you."

## Next step

`/dev-story` for the next ready story, or `/sprint-status`.
