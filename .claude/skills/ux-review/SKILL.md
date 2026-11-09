---
name: ux-review
description: "Runs a heuristic usability and WCAG 2.2 review of a flow, wireframe, design or running page, and reports severity-ranked findings with fixes. Use before building a flow, after a UI is built, or when users struggle with a screen."
argument-hint: "<flow-slug | doc path | URL | route>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# UX Review

Reviews one target and reports findings. It writes only its report; fixes are
made by the owners afterwards. A built page can be checked in a browser via the
Playwright MCP if it is configured; otherwise review the source.

## Inputs

- Argument: a UX doc (`docs/design/ux/<slug>.md`, wireframes), a design doc, a
  route/URL of the running dev server, or a component path
- `docs/design/design-system.md`, `docs/design/brand-guide.md`
- The feature spec and PRD section the target serves
- `project.yaml`: `a11y.standard`, `i18n.locales`

## Phases

### Phase 1: Scope

Confirm the target, its persona and the task the user is trying to complete.
For a URL, ask the user to confirm the dev server is running and is not production.

### Phase 2: Capture

- Docs: read the target by section.
- Running page: with Playwright MCP, open the route at 375 px and 1280 px,
  take screenshots, walk the task with the keyboard only, and run an axe scan if
  available. Without the MCP, say so and review the component source.

### Phase 3: Review in parallel

If the `web-design-guidelines` skill is installed, apply it; otherwise say it
is missing. Spawn in parallel:
- `ux-lead`: Nielsen's heuristics (status, match, control, consistency, error
  prevention, recognition, flexibility, minimalism, recovery, help), task steps,
  form design, navigation and IA.
- `accessibility-specialist`: WCAG 2.2 AA: structure, names/roles, keyboard,
  focus visible and not obscured, target size, contrast, motion, error
  identification, consistent help, redundant entry.
- `copywriter`: clarity of labels, CTAs, errors and empty states.

### Phase 4: Rank

Merge and de-duplicate. Each finding:

| ID | Severity | Where | Problem | Evidence | Fix | Owner |

Severity: **Critical** (blocks the task or excludes a user group), **High**
(major friction or WCAG A/AA failure), **Medium**, **Low** (polish). Cite the
heuristic or WCAG success criterion. Lead the report with the top three issues.

### Phase 5: Write

Ask "May I write the report to `production/audits/ux-review-<slug>-YYYY-MM-DD.md`?"

## Output

A findings report in `production/audits/`. No changes to the target.

## Next step

Hand Critical/High findings to their owners (`ui-engineer`, `ux-lead`), or run
`/propagate-design-change` if the flow doc itself must change.
