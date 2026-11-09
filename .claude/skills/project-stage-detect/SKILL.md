---
name: project-stage-detect
description: "Infers which lifecycle stage (discovery, design, build, launch, grow) the project is really in from the artifacts on disk, compares it with project.stage, and suggests a correction. Read-only. Use when the recorded stage looks wrong, after adopting a project, or when the user asks 'what stage am I in?'."
argument-hint: "[no arguments]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash(bash .claude/scripts/project-state.sh*), Bash(bash .claude/scripts/story-list.sh*), Bash(bash .claude/scripts/yaml-get.sh *), Bash(git log*), Bash(git tag*)
model: haiku
---

# Detect the project stage

Reads evidence and reports which stage it points to. It writes nothing; if the
user wants the recorded stage changed, it prints the command.

## Inputs

- `bash .claude/scripts/project-state.sh`
- `bash .claude/scripts/story-list.sh`
- `production/gates/*.md`: the latest verdict per stage
- `production/releases/`, `git tag`, host config files (deployment evidence)
- `.claude/docs/gates.md`: what each stage requires

## Phases

### Phase 1: Collect evidence

| Signal | Points to |
|---|---|
| No brief, no PRD, little or no code | discovery |
| Brief/PRD present; no specs, no stack | discovery (late) |
| Stack set; brand/design system/specs/architecture in progress; few stories | design |
| Epics and stories exist; stories `in-progress`/`done`; code and tests growing | build |
| All MVP stories done; audits or a launch checklist in `production/` | launch |
| A release exists with a production URL; experiments, incidents or analytics plan | grow |
| A gate report with `PASS` for stage X | at least the stage after X |

### Phase 2: Decide

Pick the **latest stage whose entry evidence is present**, then check whether
its predecessor gate passed. Report:

```
Recorded stage: <project.stage or none>
Evidence suggests: <stage>
Why: <3–5 bullet facts with paths>
Missing for this stage: <top 3 artifacts from gates.md>
```

### Phase 3: Suggest

- Recorded and inferred agree → say so and suggest `/help`.
- They differ → suggest `bash .claude/scripts/set-stage.sh <stage>` (or `/settings project.stage=<stage>`), and `/gate-check <previous stage>` if that gate has never passed.
- Evidence is contradictory (e.g. live site, no PRD) → say so and suggest `/reverse-document`.

## Output

Chat only.

## Next step

`/gate-check <stage>` or `/help`.
