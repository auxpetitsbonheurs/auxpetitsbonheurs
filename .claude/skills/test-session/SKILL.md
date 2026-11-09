---
name: test-session
description: "Plans, runs and reports a manual test session (task scripts per persona from the PRD's journeys, a guided live run with the user or their testers, then severity-ranked findings routed to bugs, UX, specs or scope). Works on a working prototype, client demo, vertical slice, milestone build, staging or production. Use after /working-prototype, at every milestone, and as acceptance testing before launch."
argument-hint: "[plan | run | report] <target: prototype slug | demo slug | URL | 'staging'>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Test Session

Structured manual testing: a person uses the product to do real tasks while
observations are recorded. Automated tests prove the code does what the spec
says; test sessions find out whether the **spec is right** and whether people
can actually use it. Run it early and repeatedly:

| When | Target | Focus |
|---|---|---|
| Design stage | `/working-prototype`, `/client-demo` | Do the journeys make sense? Is anything missing? |
| Start of Build | `/vertical-slice` on a preview | Does the architecture hold for a real journey? |
| Every milestone | the milestone build | Regressions, rough edges, new journeys |
| Before launch | staging (UAT) | Acceptance: every critical journey, every role, mobile |

It never contacts testers itself; the user runs sessions with real people.
Never record testers' personal data beyond a first name or alias.

## Inputs

- Target (argument) and its README / URL
- `docs/product/prd.md` (journeys, success metrics), `docs/product/personas/*`
- `docs/design/ux/*`, `docs/specs/features/*` (expected behaviour and states)
- `tests/e2e/CRITICAL-JOURNEYS.md` if it exists
- Earlier reports in `production/test-sessions/` (to re-check fixed findings)
- Template: `.claude/docs/templates/test-session.md`

## Phases

### `plan`

Brief `qa-lead` (structure, coverage) and `ux-researcher` (task wording,
questions) in parallel. Produce the session script from the template:

- **Goal**: 1–3 questions the session must answer
- **Testers**: who (personas), how many (3–5 per persona catches most issues),
  self-test by the user is fine early on
- **Tasks**: 4–8 realistic tasks written as goals, not instructions
  ("You want to book a groomer for Saturday" rather than "click Book"), each
  with a success criterion and the journey/feature it covers
- **Exploratory charter**: one time-boxed "try to break it" block
  (empty inputs, back button, refresh mid-flow, mobile, slow network, wrong role)
- **Checklists**: devices/browsers, roles, scenarios (prototype toolbar), accessibility basics (keyboard only, zoom 200%)
- **Post-session questions**: ease (1–5), what was confusing, what was missing, would they use it

Write to `production/test-sessions/YYYY-MM-DD-<slug>.md` after approval.

### `run`

Guide the user live, one task at a time: show the task, wait for their
observations (what they did, where they hesitated, what broke, quotes),
record each against the task with a timestamp, and ask the next. Note
severity as you go. If the user is observing someone else, give them the
script to read aloud and capture notes afterwards. Never coach toward the
"right" path in the task wording.

### `report`

Synthesise into findings, each with: ID (`F1`…), task, observation,
evidence (quote, count of testers affected), **severity** (S1 blocks the
task · S2 major friction · S3 minor · S4 polish) and **route**:

| Route tag | Goes to |
|---|---|
| `bug` | `/bug-report` (product builds) |
| `prototype` | `/working-prototype iterate` |
| `ux` | `ux-lead`: `/ux-flow` / `/wireframe` update |
| `copy` | `copywriter` |
| `spec` | `/propagate-design-change` on the feature spec |
| `scope` | `product-director`: PRD change via `/propagate-design-change` |
| `a11y`, `perf` | `accessibility-specialist`, `performance-engineer` |

Add task success rates, the ease scores, the top 3 insights, and a verdict
for the session's goal questions. Show the routing table and ask before
creating bug reports or changing other docs.

## Output

`production/test-sessions/YYYY-MM-DD-<slug>.md` (plan, live notes, report in
one file).

## Rigor

- `minimal`: optional; a self-test with the plan's tasks is enough.
- `standard`: required on the working prototype before the design gate, and on the build before the build gate (see `.claude/docs/gates.md`).
- `full`: plus one session per milestone with ≥ 3 testers and a UAT session on staging signed off by `qa-lead` and `product-director`.

## Next step

Prototype findings → `/working-prototype iterate <slug>`; product findings →
`/bug-triage`; doc findings → `/propagate-design-change`.
