---
name: skill-test
description: "Statically checks one skill or all skills: frontmatter validity, name/folder match, description quality, referenced paths, agents, templates and scripts exist, and canonical paths are used. Read-only. Use after editing a skill, before committing skill changes, or when a skill fails mysteriously."
argument-hint: "<skill-name | all>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash(bash studio-tests/run.sh*), Bash(python3 *)
model: haiku
---

# Test a skill

Runs static checks and reports findings. It never edits a skill; it suggests
`/skill-improve` for anything that needs fixing.

## Inputs

- `.claude/skills/<name>/SKILL.md` (or every skill with `all`)
- `.claude/docs/agent-roster.md` (valid agent names)
- `.claude/docs/templates/` (valid template names)
- `.claude/scripts/` (valid helper scripts)
- `.claude/docs/skill-conventions.md` (canonical paths)

## Phases

### Phase 1: Use the suite if present

If `studio-tests/run.sh` exists, run `bash studio-tests/run.sh skill <name>`
(or `bash studio-tests/run.sh skills` for `all`) and report its output. Then
stop, unless it is missing checks listed below; run those by hand.

### Phase 2: Manual checks

For each skill:

| # | Check | Severity |
|---|---|---|
| 1 | Frontmatter parses as YAML (`python3 -c 'import yaml…'`) | error |
| 2 | `name` equals the folder name | error |
| 3 | `description` is quoted, < 400 chars, says what it does **and** "Use when…" | warning |
| 4 | `user-invocable`, `allowed-tools`, `model` present; model ∈ opus/sonnet/haiku | warning |
| 5 | Every `` `agent-name` `` that looks like a roster role exists in `agent-roster.md` | error |
| 6 | Every `.claude/docs/templates/<x>` referenced exists | error (warning before Phase 6 of the build) |
| 7 | Every `.claude/scripts/<x>.sh` referenced exists | error |
| 8 | Every `/other-skill` referenced exists as a folder | warning |
| 9 | Write/Edit in `allowed-tools` ⇒ body asks before writing ("May I write") or names the orchestrated path | warning |
| 10 | Output paths match the canonical table in the conventions | warning |
| 11 | No instruction to commit, push, deploy, migrate shared DBs, send email, or use live keys | error |
| 12 | Body length ≤ ~150 lines | info |

### Phase 3: Report

```
Skill: <name>   errors: N   warnings: N
✗ [5] references `frontend-guru`, which is not in the roster (line 42)
⚠ [3] description lacks a "Use when" clause
```

With `all`, print a summary table (skill, errors, warnings) and the details
only for skills with errors.

## Output

Chat only.

## Next step

`/skill-improve <name>` for any skill with errors.
