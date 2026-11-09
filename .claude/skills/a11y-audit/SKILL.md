---
name: a11y-audit
description: "Audits accessibility against WCAG 2.2 AA (or project.yaml a11y.standard): automated axe scans via Playwright plus a manual keyboard and screen-reader checklist on critical journeys. Use before launch, after UI changes, or when asked whether the site is accessible."
argument-hint: "[url | route list | 'local']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npx playwright*), Bash(npx @axe-core/cli*)
model: sonnet
---

# Accessibility Audit

Finds accessibility barriers and writes `production/audits/a11y-YYYY-MM-DD.md`.
Automated tools catch roughly a third of issues, so this audit always pairs
them with manual checks. It never fixes code without approval and never
claims conformance that was not tested.

## Inputs

- `project.yaml`: `a11y.standard`, `budgets.lighthouse.accessibility`
- `docs/design/design-system.md`: tokens (contrast) and component list
- PRD critical journeys; `docs/content/sitemap.md`
- Argument: target URL/routes, or `local` (production build, as in `/perf-audit`)

## Phases

### Phase 1: Scope

Agree the routes (3–10) and the journeys to walk by hand (signup, login, the
core task, checkout, a form with errors). Ask the user if anything is out of
scope (e.g. a third-party embed).

### Phase 2: Automated scan

If `@axe-core/playwright` is installed, run (or generate, after approval, under
`tests/e2e/a11y.spec.ts`) a spec that visits each route in light and dark mode
and at 320 px and 1280 px widths, and calls `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()`.
Otherwise use `npx @axe-core/cli <url>`. Capture violations with rule, impact,
selector and the page.

If `web-design-guidelines` (vercel-labs/agent-skills) is installed, also run
its interface audit over the changed UI files; if not, say so and continue.

### Phase 3: Code review

Spawn `accessibility-specialist` to review components and pages (Grep for
`onClick` on non-interactive elements, `<img` without `alt`, inputs without
labels, `tabIndex` > 0, `aria-hidden` on focusable elements, `outline: none`
without a replacement, `autoplay`, colour-only status).

### Phase 4: Manual checklist

Walk each journey (via Playwright MCP if available, otherwise give the user the
checklist to run and record their answers):
- Keyboard only: everything reachable, logical order, visible focus, no traps, skip link works, Escape closes dialogs, focus returns.
- Screen reader (VoiceOver or NVDA): page title, landmarks, heading outline, form labels and errors announced, live regions for async results, meaningful link text.
- Zoom to 200% and 400% (reflow at 320 px): no loss of content or horizontal scroll.
- `prefers-reduced-motion`: motion reduced; `prefers-color-scheme`: contrast holds in both themes.
- Target size ≥ 24×24 px; error messages linked to fields; no time limits without extension.

### Phase 5: Report

Use the `a11y-report` template: summary, scope, method, findings ranked
**Critical** (blocks a journey for a user group) → **Serious** → **Moderate** →
**Minor**, each mapped to a WCAG success criterion with evidence (route,
selector, file:line) and a fix at the component level. Ask before writing.

### Phase 6: Follow-up

Offer stories or bugs for Critical/Serious findings, and offer to draft an
accessibility statement section with known limitations.

## Output

`production/audits/a11y-YYYY-MM-DD.md` (template: `.claude/docs/templates/a11y-report.md`).

## Rigor

- `minimal`: automated scan of key routes.
- `standard`: scan + code review + keyboard pass on critical journeys.
- `full`: all of the above + screen-reader pass + zoom/reflow on every journey.

## Next step

`/create-stories` for the fixes, then re-run `/a11y-audit` on the fixed routes.
