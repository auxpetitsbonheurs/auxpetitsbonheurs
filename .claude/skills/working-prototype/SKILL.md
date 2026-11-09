---
name: working-prototype
description: "Builds an early, runnable prototype of the product's core journeys (real interactions, mocked backend, seeded and resettable data, role and scenario switches) so the user and testers can try it by hand before the real build. Use in the Design stage once the PRD and key flows exist, to iterate on a prototype after a test session, or when the user wants something they can click and test early."
argument-hint: "[new | iterate] [slug]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npm *), Bash(pnpm *), Bash(npx *), Bash(bun *)
model: sonnet
---

# Working Prototype

The studio's early manual-testing build. Unlike `/client-demo` (static
screens to show the look) and `/prototype` (a spike that answers one
question), this is a **functional app** covering the PRD's core journeys end
to end, so people can sign up, do the core task and hit the edge cases by
hand, weeks before the production build. It lives in `prototypes/<slug>/`,
outside `src/`, and is **thrown away** once the real build covers it: its
lessons move into the specs, not its code.

It never deploys, never uses real accounts, payments, email or AI calls, and
never touches production data.

## Inputs

- `docs/product/prd.md`: core journeys, MVP features, success metrics
- `docs/product/personas/*`: who will test, what they try to do
- `docs/design/ux/*` (flows, wireframes) and, if present, `docs/design/demo/*` and `docs/design/tokens.json`
- `docs/specs/features/*` if already written (use their states and edge cases)
- `project.yaml → stack` (see `.claude/docs/stack-matrix.md`) and `project.type`
- Previous test-session reports in `production/test-sessions/` (mode `iterate`)

## Phases

### Phase 1: Scope

Propose, in one message:

- **Journeys** (2–5): from the PRD, e.g. sign up → onboarding → first core task → see result; plus checkout or settings when they matter
- **Fidelity**: real interactions and validation; styling from tokens if they exist, otherwise clean neutral UI (looks are `/client-demo`'s job)
- **Faked parts**: auth (role switcher instead of login), payments (fake success/decline buttons), email (in-app "outbox" panel), AI (canned responses), third-party APIs (fixtures)
- **Scenarios**: e.g. new empty account, busy account, error-prone network
- **Tech**: the chosen stack's frontend framework if `/setup-stack` has run (so lessons transfer), otherwise the quickest fit (Vite + React + the project's styling). Data in memory/localStorage, or MSW handlers shaped like the planned API contract
- **Time-box** (default: one session per journey)

For `api` projects: a mock server generated from the API contract (e.g.
Prism from `openapi.yaml`, or a small Hono/FastAPI stub) plus an HTTP
collection (`.http`/Bruno) to exercise it by hand.

Ask "Does this scope work?" and wait.

### Phase 2: Build

Brief `prototyper` (owner) with `ui-engineer` for screens and the frontend
stack specialist when a stack is set; `ux-lead` checks the flows match
`docs/design/ux/`. Structure:

```
prototypes/<slug>/
  README.md      Type: working-prototype · journeys · how to run · what is fake · version log
  package.json   one command: `npm run dev` (or `pnpm dev`)
  src/           app code; mocks/ (fake API, seed data, scenarios)
```

Every build includes a fixed **prototype toolbar** (collapsible):

- Role switcher (visitor / user / admin, from the PRD's roles)
- Scenario switcher (empty, typical, heavy, error states) and **Reset data**
- Fake outbox (emails/notifications the real app would send)
- Toggle to simulate slow network and API errors
- A persistent "Prototype: fake data, nothing is saved" label

Keep tests optional (rule: `.claude/rules/prototype-code.md`), but make the
seeds deterministic so testers see the same thing.

### Phase 3: Self-check

Run the dev server, walk each journey once (Playwright if available, else a
manual checklist), and confirm: every journey completes, every scenario
loads, Reset works, nothing calls a real external service. Report anything
that does not work before handing it to testers.

### Phase 4: Hand off

Ask "May I write the prototype to `prototypes/<slug>/`?" and install its
dependencies only after yes (local install only). Then print:

- Run: `cd prototypes/<slug> && npm install && npm run dev`
- Share for remote testers: a static/preview deploy via `/deploy-setup` (the user runs it)
- Next: `/test-session plan <slug>`

Append to `production/session-state/active.md` that prototype `<slug>` v1 exists.

### Mode `iterate <slug>`

Read the latest `production/test-sessions/*-<slug>.md`. List the findings
tagged `prototype` with a proposed change each; on approval apply them, bump
the version in the README's version log ("v2: simplified onboarding to 2
steps (TS-2026-11-09 F3)"), and suggest another `/test-session`. Findings
tagged `spec`, `scope` or `brand` go to `/propagate-design-change`, not into
prototype code.

## Output

`prototypes/<slug>/` (runnable app + README with `Type: working-prototype`).

## Rigor

- `minimal`: optional; one journey is enough.
- `standard`: required before `/gate-check design` (not for pure `api` projects, which use the mock server variant); all core journeys.
- `full`: plus at least one `iterate` round driven by a test session.

## Next step

`/test-session plan <slug>`, then `/working-prototype iterate <slug>` until the
journeys feel right; then `/feature-spec` captures what was learned.
