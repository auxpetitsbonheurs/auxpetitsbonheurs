---
name: review-code
description: "Reviews a diff, branch or path against the project's rules, specs, API contract, security checklist and budgets, using the frontend, backend and security leads in parallel. Reports findings with file:line and severity; read-only unless --fix is approved. Use before /story-done, before merging, or when the user asks for a review."
argument-hint: "[branch | path | 'staged'] [--fix]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, AskUserQuestion, Agent, Bash(git diff*), Bash(git log*), Bash(git status*), Bash(bash .claude/scripts/*)
model: sonnet
---

# Code Review

Reviews changed code the way a strict senior team would. It reports; it fixes
only with `--fix` and the user's approval of each change.

## Inputs

- The target: `staged` (`git diff --cached`), a branch (`git diff main...<branch>`),
  a path, or by default the working tree vs `HEAD`
- `.claude/rules/*.md` whose `paths:` match the changed files
- The story and spec sections the change implements (from the checkpoint or branch name)
- `docs/architecture/api/` contract, `project.yaml` budgets, `.claude/docs/coding-standards.md`

## Phases

### Phase 1: Scope

List changed files and classify them: frontend, backend, data/migrations, infra,
tests, docs. Pick reviewers:

| Changed | Reviewer |
|---|---|
| UI, components, styles, client code | `lead-frontend` (+ frontend stack specialist) |
| Handlers, actions, services, queries | `lead-backend` (+ backend/data specialist) |
| Auth, payments, uploads, webhooks, AI, anything with user input | `security-lead` |
| Migrations | `data-engineer` |
| CI, Docker, IaC | `devops-lead` |

### Phase 2: Review in parallel

Spawn the reviewers **in parallel**, each with only its files, the matching
rules, the spec sections and its checklist (from its agent file). If the stack
is React-based and `react-best-practices` is installed, the frontend reviewer
applies it; otherwise say it is missing.

Every reviewer checks: correctness against the ACs, tests (does each changed
behaviour have one; are they meaningful), contract conformance, error handling,
and naming.

### Phase 3: Consolidate

Merge and de-duplicate findings. Each finding:
`[severity] path:line: problem. Why it matters. Suggested fix.`

| Severity | Meaning |
|---|---|
| `blocker` | Bug, security hole, data loss, contract break, failing/missing test for an AC |
| `major` | Rule or budget violation, missing state, a11y failure, N+1 |
| `minor` | Readability, naming, small duplication |
| `nit` | Style preferences (only if no formatter covers it) |

Print a summary: counts by severity, then findings by file. End with a verdict:
`APPROVE`, `APPROVE WITH CHANGES` (no blockers), or `CHANGES REQUESTED`.

### Phase 4: Fix (only with `--fix`)

For each blocker/major, show the proposed edit and ask before applying. Run the
tests after the fixes. Never "fix" a finding by deleting or weakening a test.

## Next step

`/story-done S-NNN` once there are no blockers.
