---
name: start
description: "Guided onboarding for a new or returning user. Use when the user just cloned or installed the studio, has no idea or stack yet, asks where to begin, or wants to bring in an existing website."
argument-hint: "[no arguments]"
user-invocable: true
allowed-tools: Read, Glob, Grep, AskUserQuestion, Bash(mkdir -p .claude/scripts*), Bash(cp *), Bash(bash .claude/scripts/project-state.sh*), Bash(bash .claude/scripts/set-stage.sh *), Bash(bash .claude/scripts/config-set.sh *)
model: sonnet
---

# Guided Onboarding

The entry point. It assumes no idea, no stack and no experience. It reads the
project, asks where the user is starting from, records the stage, rigor and
automation (only after an explicit yes), and names **one** next step. It never
runs that step itself.

It writes only `project.name`, `project.type`, `project.stage` (+
`production/stage.txt`), `modes.rigor` and `modes.automation`, all through the
helper scripts. It never writes the knobs rigor expands to (see
`.claude/docs/config-resolution.md`).

Ask with the question tool. Without one, list numbered options and end the
turn. The question is the last thing in the reply. A skipped or dismissed
question is not an answer: ask again in plain text.

## Phase 0: Plugin install check

If `.claude/scripts/yaml-get.sh` does not exist, the studio was installed as a
plugin into an existing repo and the helpers are not in the project yet. This
skill's base directory is `<plugin>/.claude/skills/start/`, so the plugin's
helpers are at `<plugin>/.claude/scripts/` and its config template at
`<plugin>/project.yaml`. Say so, and ask: "May I copy the studio's helper
scripts into `.claude/scripts/` and create `project.yaml`?" On yes, `mkdir -p
.claude/scripts` and copy them (never overwrite an existing `project.yaml`).
Without them, every skill still works but cannot read or save settings.

## Phase 1: Read the project

Run `bash .claude/scripts/project-state.sh` and keep the rows; do not show them yet.

- `stack_*` set, or `manifest:` rows present → there is (or will be) code.
- `brief` / `prd` → discovery work exists.
- `origin_url` containing `claude-code-web-studios` (case-insensitive) → the
  clone still points at the template repo; a push would go there. Warn once.

**Returning user** (`stack_frontend` or `stack_backend` set **and** `prd: yes`):
ask nothing. Summarise name, type, stage, stack and rigor in three lines,
suggest `/help`, add the template-remote note if it applies, and stop.

## Phase 2: Where are you starting from?

Ask: "Welcome to Web Studios! Where are you starting from?"
- `A) No idea yet`: I want to build something but don't know what.
- `B) Rough idea`: e.g. "a booking site for dog groomers".
- `C) Clear concept`: I know the product, users and core features.
- `D) Existing website or codebase`: there's already code, docs or a live site.

If the answer contradicts Phase 1, say what you found once and re-ask (D on an
empty repo; A with `manifest:` rows on disk).

## Phase 3: Project type

Skip for D when the type is obvious from the code; otherwise ask:
"What kind of project is it?" → `SaaS / web app`, `Marketing / landing site`,
`E-commerce store`, `API / backend service` (multi-select allowed → `mixed`).
For A, offer "Not sure yet" and leave `project.type` unset.

## Phase 4: Rigor

Skip if `modes.rigor` is already set. Ask: "How much process do you want?"
- `Minimal`: prototype or side project. Checks warn but don't block; docs are brief.
- `Standard (Recommended)`: a real product. TDD for logic, gates required, hooks block secrets and broken commits.
- `Full`: production with users' money or data. Every check blocks, all six launch audits, director sign-off at gates.

## Phase 5: Automation

Skip if `modes.automation` is already set. Ask: "How often should I check with you before writing files?"
- `Ask every time (Recommended)`: you approve each file.
- `Batch`: approve a phase's changeset once.
- `Auto for docs`: orchestrated skills write the docs they name without re-asking; code and anything outward-facing still asks.
(values: `ask`, `batch`, `auto`)

## Phase 6: Confirm and record

Show a short summary (starting point, type, stage, rigor, automation) and the
stage you infer:
- A, B, C → `discovery`
- D → `discovery` if there is no PRD, `build` if there is code and a PRD,
  otherwise let `/adopt` decide (record nothing yet)

Ask "May I save these to `project.yaml`?" On yes, run `config-set.sh` for each
value and `set-stage.sh <stage>`.

## Phase 7: The one next step

| Start | Next step | What it does |
|---|---|---|
| A | `/brainstorm open` | Explores problems worth solving and writes `docs/product/brief.md` |
| B | `/brainstorm <your idea>` | Sharpens the idea into a brief |
| C | `/write-prd` | Turns the concept into a PRD (it will ask for anything missing) |
| D | `/adopt` | Detects the stack, writes `project.yaml`, maps what exists |

Then show the road ahead in one line:
**Discovery → Design (`/setup-stack`, `/design-system`, `/working-prototype` + `/test-session`, `/feature-spec`) →
Build (`/dev-story`) → Launch (`/launch-checklist`) → Grow.**

Mention `/install-deps` once (optional design + testing skills) and that
`/help` always names the next step. End there.
