---
name: onboard
description: "Orients a returning user or a new collaborator on an existing project: what it is, the stack, the stage, the decisions made, what is in progress, and where things live. Use when someone joins the project, comes back after a break, or asks 'catch me up'."
argument-hint: "[area: product | design | tech | build | all]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash(bash .claude/scripts/project-state.sh*), Bash(bash .claude/scripts/story-list.sh*), Bash(bash .claude/scripts/yaml-get.sh *), Bash(git log*)
model: sonnet
---

# Onboard: catch me up

Produces a concise briefing of the project as it stands, from what is on disk
and in git. Read-only: it writes nothing and runs no other skill.

It is for a project that already exists. With nothing configured (no stage, no
stack, no brief), say so and suggest `/start`, then stop. For a codebase that
has code but no studio docs, suggest `/adopt` instead.

## Inputs

- `bash .claude/scripts/project-state.sh`
- `project.yaml`: `project.*`, `stack.*`, `modes.*`, `budgets`
- `docs/product/brief.md`, `docs/product/prd.md`: problem, users, metrics, scope (by section)
- `docs/architecture/architecture.md` and `docs/architecture/adr/*.md`: titles and decisions only
- `docs/design/brand-guide.md`, `docs/design/design-system.md`: summary sections only
- `docs/specs/features/*.md`: titles and status lines
- `bash .claude/scripts/story-list.sh`: story status counts
- `production/session-state/active.md`, the latest `production/sprints/sprint-*.md`
- `git log --oneline -15`
- Argument: an area narrows the briefing to that section.

## Phases

### Phase 1: Gather

Run the helpers and read the files above **by section** (Grep `^#`, then Read
the range). Never read a whole long doc to summarise one heading.

### Phase 2: Brief

Reply with these sections, each 2–6 lines, skipping any with nothing on disk:

1. **What it is**: one sentence from the brief/PRD (product, user, problem), plus project type and stage.
2. **Stack**: frontend, backend, database, hosting, key integrations; rigor and automation modes.
3. **Key decisions**: the ADR titles with one-line decisions; brand personality in three words.
4. **Scope**: MVP features with spec status (`spec'd` / `in build` / `done`).
5. **Work in progress**: active story from `active.md`, current sprint goal, story counts by status, anything `blocked`.
6. **Recent activity**: the last 5 meaningful commits, grouped.
7. **Where things live**: the 5–8 paths a newcomer needs (point to `.claude/docs/directory-structure.md` for the rest).
8. **Open questions**: from `active.md` "Open questions" and any `TBD`/`[TO BE DECIDED]` markers in the PRD and specs (Grep, cite file:line).

### Phase 3: Point onward

End with the one next step (the same logic as `/help`), and mention that
`/help <topic>` lists skills and agents for any area.

## Output

Chat only. No files.

## Next step

`/help`, or the next step named in the briefing.
