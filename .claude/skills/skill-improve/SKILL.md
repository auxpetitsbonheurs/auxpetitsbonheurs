---
name: skill-improve
description: "Improves an existing studio skill from feedback or an observed failure, keeping it within the skill conventions and checking its cross-references. Use when a skill misbehaved, gave a wrong next step, wrote to the wrong path, asked too many or too few questions, or the user wants it changed."
argument-hint: "<skill-name> [what went wrong]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, AskUserQuestion, Bash(bash studio-tests/run.sh*)
model: sonnet
---

# Improve a skill

Edits one `SKILL.md` to fix a concrete problem. It keeps the change as small
as the problem, preserves the conventions in
`.claude/docs/skill-conventions.md`, and runs `/skill-test` checks afterwards.

## Inputs

- `.claude/skills/<skill-name>/SKILL.md`
- `.claude/docs/skill-conventions.md`, `.claude/rules/skill-authoring.md` (if present)
- The feedback: from the argument, or ask "What happened, and what should it have done?"
- Skills that chain into or out of this one (Grep for `/<skill-name>` across `.claude/skills/`)

## Phases

### Phase 1: Understand the failure

Restate the problem as: **trigger** (what the user did) → **actual** →
**expected**. If the feedback is vague, ask one question to pin it down. Find
the lines responsible and quote them with line numbers.

### Phase 2: Propose

Propose the minimal edit as a diff. Check it against:
- Frontmatter: `name` matches the folder; `description` says what it does **and** when to use it; `allowed-tools` lists only what the body uses.
- Canonical paths and story format from the conventions.
- Chaining: if the change alters an output path or format, list every skill that reads it and whether they need a matching change (propose those too, or flag them).
- Collaboration rules: still asks before writing; no outward-facing action added.
- Length stays under ~150 lines; move detail into a template or doc rather than growing the skill.

Ask "Apply this change?"

### Phase 3: Apply and verify

On yes, apply with Edit. Then run `bash studio-tests/run.sh skill <skill-name>`
if it exists; otherwise do the static checks from `/skill-test` by hand and
report them.

## Output

The edited `.claude/skills/<skill-name>/SKILL.md` (and any approved companion edits).

## Next step

`/skill-test <skill-name>`.
