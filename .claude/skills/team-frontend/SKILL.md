---
name: team-frontend
description: "Orchestrates the frontend team (lead-frontend, ui-engineer, accessibility-specialist and the configured framework specialist) to plan and build a UI feature or epic from its spec and designs, test-first, with review. Use for a UI-heavy feature, a set of screens, or a frontend epic."
argument-hint: "<feature spec path | epic id | story ids>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Team: Frontend

Coordinates a frontend delivery. The skill is the orchestrator: it briefs
agents, collects their results and puts every decision and file change to
the user. Agents write only after approval (or at paths this skill names,
under `modes.automation: auto`, for docs only).

## Inputs

- The feature spec (`docs/specs/features/<slug>.md`), its UX doc in `docs/design/ux/`, the API contract section
- `docs/design/design-system.md`, `docs/design/tokens.json`
- Stories for the scope (`bash .claude/scripts/story-list.sh`)
- `project.yaml`: `stack.frontend`, `stack.styling`, `budgets`, `a11y.standard`, `i18n.locales`

## Agents

| Agent | Role here |
|---|---|
| `lead-frontend` | Plan, component breakdown, final review |
| the framework specialist for `stack.frontend` (`nextjs-specialist`, `nuxt-vue-specialist`, `sveltekit-specialist`, `astro-specialist`, `angular-specialist`, `remix-specialist`, `solid-qwik-specialist`) | Routing, data fetching, server/client boundary |
| `tailwind-shadcn-specialist` (when `stack.styling` is tailwind-shadcn) | Tokens, components/ui, variants |
| `ui-engineer` | Components, screens, forms, tests |
| `accessibility-specialist` | Accessible patterns up front, audit at the end |

## Phases

### Phase 1: Readiness

Check every story in scope passes the "ready story" criteria (acceptance
criteria, spec link, designs). If not, list the gaps and suggest
`/story-readiness`; stop for any story missing designs or a contract.

### Phase 2: Plan (parallel)

Spawn at the same time:
- `lead-frontend`: component tree, which are new vs existing design-system components, state and data-fetching strategy, file list
- framework specialist: routes/layouts, server vs client components, loading/error boundaries
- `accessibility-specialist`: the accessible pattern for each interactive component (dialog, combobox, tabs…) and focus management

Merge into one plan. Show it and ask: "Does this plan match what you want?"

### Phase 3: Build, story by story

For each story, in dependency order, `ui-engineer` (with the specialists)
follows the `/dev-story` loop: failing test from an acceptance criterion →
code → refactor. Show diffs and ask before writing. Run
`bash .claude/scripts/test-run.sh unit` after each story and report results.

### Phase 4: Review (parallel)

- `lead-frontend`: review against the frontend checklist (design-system use, states, client JS, tests)
- `accessibility-specialist`: axe + keyboard pass on the changed screens (Playwright MCP if installed)
- `performance-engineer`: bundle/JS kB and LCP impact against `budgets`

### Phase 5: Report

Summary table per story: status, tests, review findings, open items. If any
agent was BLOCKED, say which and why; still report the rest. Update story
`Status:` lines (ask first) and the session checkpoint.

## Next step

`/review-code` on the branch, then `/story-done` per story.
