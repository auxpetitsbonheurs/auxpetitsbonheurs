---
name: design-review
description: "Reviews screens, mockups or built UI against the brand guide, design system and the quality bar, returning a DD-REVIEW verdict with specific, actionable critique. Use before handing designs to engineering, after UI is built, or when something looks off-brand or generic."
argument-hint: "<doc path | mockup folder | route/URL | component path>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: opus
---

# Design Review

Reviews one target and writes only its report. Gate `DD-REVIEW`
(Verdicts: `APPROVE` / `CONCERNS` / `REJECT`, or `NOT ASSESSED`). For a running
page it uses the Playwright MCP to capture screenshots if configured;
otherwise it reviews the source and says so.

## Inputs

- Argument: the target (wireframe doc, HTML mockup, route on the dev server, component)
- `docs/design/brand-guide.md`, `docs/design/design-system.md`, `docs/design/tokens.json`
- The feature spec's UX section for the target
- `project.yaml`: `a11y.standard`

## Phases

### Phase 1: Capture

Docs and mockups: read them. Running UI: ask the user to confirm the dev server
URL, then capture 375 px and 1280 px screenshots, light and dark themes, and the
key states (empty, error, loading) where reachable. For components, read the
source and the classes/tokens used.

### Phase 2: Review in parallel

If `frontend-design` or `web-design-guidelines` skills are installed, apply them;
otherwise say which are missing. Spawn in parallel:
- `design-director`: brand fit, distinctiveness (not a templated default),
  hierarchy, one primary action, typography, imagery, overall craft.
- `ui-designer`: design-system and token conformance: hard-coded colours,
  off-scale spacing, inconsistent radii, one-off components, motion.
- `accessibility-specialist`: contrast in both themes, focus visibility, target
  sizes, text resizing to 200%, reduced motion.

Ask each for specific critique: what, where, why, and the concrete fix
("Increase the hero subhead to `type.scale.lg` and drop the second CTA"),
never vague taste ("make it pop").

### Phase 3: Verdict

Findings table: | ID | Severity | Where | Issue | Principle/rule | Fix | Owner |
- `REJECT`: off-brand overall, or an accessibility failure that blocks users.
- `CONCERNS`: notable system violations or quality gaps.
- `APPROVE`: only polish items left.

### Phase 4: Write

Ask "May I write the report to `production/audits/design-review-<slug>-YYYY-MM-DD.md`?"

## Output

A report in `production/audits/` with `DD-REVIEW: <verdict>` on its first line.

## Next step

Hand fixes to `ui-engineer`/`ui-designer`; if the design system itself must
change, `/design-system update`.
