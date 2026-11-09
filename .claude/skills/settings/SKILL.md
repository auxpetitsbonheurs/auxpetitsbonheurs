---
name: settings
description: "Shows or changes project settings in project.yaml (stack, stage, budgets, modes), or per-developer overrides in project.local.yaml with --local. Use when the user wants to see the configuration, change rigor or automation, adjust a budget, or override a setting just for themselves."
argument-hint: "[key | key=value | --local key=value]"
user-invocable: true
allowed-tools: Read, Edit, AskUserQuestion, Bash(bash .claude/scripts/yaml-get.sh *), Bash(bash .claude/scripts/config-set.sh *), Bash(bash .claude/scripts/set-stage.sh *)
model: haiku
---

# Settings

Reads and writes configuration through the helper scripts only. It never
hand-edits YAML, and it explains what a change affects before making it.

Resolution order is described in `.claude/docs/config-resolution.md`:
`project.local.yaml` → `project.yaml` → rigor expansion → defaults.

## Inputs

- Argument forms:
  - none → show a summary
  - `key` → show one value and where it came from
  - `key=value` → change `project.yaml`
  - `--local key=value` → change `project.local.yaml` (gitignored, per developer)

## Phases

### Phase 1: Show

With no argument, read `project.yaml` (and `project.local.yaml` if present)
and print grouped tables: **Project** (name, type, stage), **Modes** (rigor,
automation), **Stack** (only keys that are set), **Specialists**, **Budgets**,
**a11y / i18n / privacy**. Mark values overridden locally with `(local)`.

With a `key` argument, print its value from each layer and the effective one.

### Phase 2: Validate a change

Before writing:
- `project.stage` → only via `set-stage.sh` (values: discovery, design, build, launch, grow). Moving forward past an unpassed gate: warn and suggest `/gate-check`.
- `modes.rigor` ∈ minimal / standard / full; `modes.automation` ∈ ask / batch / auto. Show what the rigor change expands to (table in `config-resolution.md`).
- Do not write a knob that rigor expands to (`modes.review_mode`, `quality.tdd`, `quality.hook_strictness`, `docs.density`, `quality.gates`, `quality.audits_before_launch`) unless the user explicitly wants to pin it; explain that pinning stops rigor from changing it.
- `stack.*` → warn that changing a core technology needs an ADR; suggest `/setup-stack --change <key>` instead.
- Budgets must be numbers; tightening is fine, loosening a budget asks "why?" and suggests noting the reason in the PRD.
- Keys deeper than two levels (`budgets.lighthouse.performance`) are not supported by `config-set.sh`; show the exact line for the user to edit by hand, or edit it yourself after asking.

### Phase 3: Write

State the old → new value and its effect, ask "Change it?", and on yes run
`config-set.sh [--local] key=value` (or `set-stage.sh`). Print the helper's
output.

## Output

`project.yaml` or `project.local.yaml`.
