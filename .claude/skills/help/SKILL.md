---
name: help
description: "Tells the user where the project stands and the next best step. Use when the user asks what to do next, is lost, asks which skill to use, or wants an overview of available commands."
argument-hint: "[topic | 'all']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash(bash .claude/scripts/project-state.sh*)
model: haiku
---

# Help: where am I, what next?

Read-only. It never writes files and never runs the skill it suggests.

## With an argument

- `all` → print the skill catalogue from `docs/WORKFLOW-GUIDE.md` grouped by stage.
- a topic (e.g. `payments`, `seo`, `testing`) → list the 2–5 skills and agents
  most relevant to it, one line each, using `docs/BLUEPRINT.md` §4 and the
  `description:` lines in `.claude/skills/*/SKILL.md`.

## Without an argument

1. Run `bash .claude/scripts/project-state.sh`.
2. If nothing is configured (no stage, no stack, no brief): say so and suggest `/start`. Stop.
3. Otherwise pick the **first unmet** row for the current stage:

| Stage | Check (in order) | Suggest |
|---|---|---|
| discovery | `brief: no` | `/brainstorm` |
| | `prd: no` | `/write-prd` |
| | `personas: 0` and rigor ≠ minimal | `/personas` |
| | all present | `/gate-check discovery` |
| design | `stack_frontend` and `stack_backend` empty | `/setup-stack` |
| | `brand_guide: no` (not `api` type) | `/brand-identity` |
| | `design_system: no` (not `api` type) | `/design-system` |
| | `ux_docs: 0` (not `api` type) | `/ux-flow` |
| | `working_prototypes: 0` and rigor ≠ minimal | `/working-prototype` (early build to test by hand) |
| | `test_sessions: 0` and a prototype exists | `/test-session plan <slug>` |
| | `feature_specs: 0` | `/feature-spec` |
| | `architecture: no` | `/create-architecture` |
| | all present | `/gate-check design` |
| build | `epics: 0` | `/create-epics` |
| | `stories: 0` | `/create-stories` |
| | `sprints: 0` | `/sprint-plan` |
| | `tests: 0` and `source_files` > 0 | `/test-setup` |
| | otherwise | `/dev-story` (next ready story) or `/sprint-status` |
| launch | no `production/audits/` reports | `/team-launch` (or the individual audits) |
| | `releases: 0` | `/launch-checklist` |
| grow | — | `/analytics-plan`, `/experiment`, `/retrospective` |

4. Reply in at most six lines: stage, what exists, the **one** next step and
   why, and one alternative. If `active_session: yes`, mention that
   `production/session-state/active.md` holds where the last session stopped.
