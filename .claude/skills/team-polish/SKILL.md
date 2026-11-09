---
name: team-polish
description: "Runs a pre-launch polish pass across the site: performance, accessibility, copy, visual consistency with the design system, empty/error/loading states, 404/500 pages, favicons and social cards, then fixes approved items. Use in the last sprint before launch or before showing the product to users."
argument-hint: "[route list | 'all']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Team: Polish

Finds the rough edges users notice first and fixes the ones the user
approves. Writes the findings to `production/audits/polish-YYYY-MM-DD.md`.
Uses the Playwright MCP to view pages if installed; otherwise reviews source
and asks for screenshots.

## Inputs

- Route list (argument) or the sitemap `docs/content/sitemap.md`
- `docs/design/design-system.md`, `docs/design/tokens.json`, `docs/design/brand-guide.md`
- `project.yaml`: `budgets`, `a11y.standard`, `i18n.locales`

## Agents and checklist (spawned in parallel)

| Agent | Checks |
|---|---|
| `ui-designer` | Visual consistency: token-only colours/spacing/type, alignment, icon set, dark mode, responsive breakpoints (320, 390, 768, 1024, 1440) |
| `ux-lead` | Every screen's loading, empty, error, success and permission-denied states; form validation and error recovery; focus after actions |
| `copywriter` | Typos, tone consistency, button labels, error messages, placeholder/lorem text left behind, title case vs sentence case consistency |
| `accessibility-specialist` | axe on each route, keyboard pass, focus visibility, skip link, alt text |
| `performance-engineer` | LCP/INP/CLS and JS kB per route vs `budgets`, image sizes, font loading |
| `lead-frontend` | 404 and 500 pages branded and helpful; favicon set + `manifest`; OG/Twitter images per key page; page titles; console errors and warnings; broken links |

## Phases

### Phase 1: Sweep

Spawn all six agents at once with the route list. Collect findings with
route, evidence (screenshot or file:line), severity (`blocker`, `major`,
`minor`) and estimated minutes to fix. Report BLOCKED agents and continue.

### Phase 2: Triage

Merge duplicates, group by route, sort by severity then effort. Show the
list and ask which to fix now: `All blockers + majors (Recommended)`,
`Blockers only`, `Let me pick`.

### Phase 3: Fix

Route each approved item to its owner (`ui-engineer` for most UI fixes,
`copywriter` for copy, the framework specialist for metadata/404/500).
Show diffs and ask before writing, in batches by route. Run
`bash .claude/scripts/test-run.sh unit` after each batch.

### Phase 4: Report

Ask "May I write this to `production/audits/polish-YYYY-MM-DD.md`?" with
fixed, deferred (→ `/tech-debt` or stories) and won't-fix items.

## Next step

`/team-launch`.
