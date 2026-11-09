---
name: perf-audit
description: "Audits performance against project.yaml budgets: Lighthouse on key routes, Core Web Vitals, JS bundle size, images, fonts and caching. Use before launch, after big UI changes, when pages feel slow, or when a budget check fails."
argument-hint: "[url | route list | 'local']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npx lighthouse*), Bash(npx @lhci/cli*), Bash(npx vite-bundle-visualizer*), Bash(npx next build*), Bash(pnpm build*), Bash(npm run build*), Bash(du *), Bash(find *)
model: sonnet
---

# Performance Audit

Measures the site against the budgets in `project.yaml` and writes a
severity-ranked report to `production/audits/perf-YYYY-MM-DD.md`. It never
changes code: every fix becomes a proposed story or bug the user approves.

## Inputs

- `project.yaml`: `budgets.lighthouse.*`, `budgets.web_vitals.*`, `budgets.js_initial_kb`, `budgets.image_max_kb`, `stack.frontend`, `stack.hosting`
- `.claude/docs/stack-matrix.md`: the build and start commands for the stack
- `docs/content/sitemap.md` or the PRD's critical journeys: which routes matter
- Argument: a preview/staging URL, a list of routes, or `local`

## Phases

### Phase 1: Choose the target

Ask (unless the argument answers it): "What should I measure?"
- `Local production build (Recommended)`: build and start locally, then measure `http://localhost:<port>`.
- `Preview / staging URL`: you give the URL.
- `Production URL`: read-only Lighthouse runs only; no load is generated.

Never measure the dev server: its numbers are meaningless. Pick 3–8 key routes
(home, pricing/landing, signup, the core app screen, a content page, a product
page) from the sitemap; show the list and let the user edit it.

### Phase 2: Lab measurements

For each route, run Lighthouse with the mobile preset (throttled), three runs,
and take the median:

```bash
npx lighthouse <url> --preset=perf --form-factor=mobile --output=json --output-path=./.lighthouseci/<slug>.json --quiet --chrome-flags="--headless"
```

If `@lhci/cli` is configured (`lighthouserc.*`), prefer `npx @lhci/cli autorun`.
Record performance, accessibility, best-practices and SEO scores, plus LCP,
CLS, TBT (lab proxy for INP), the LCP element, and render-blocking resources.

### Phase 3: Bundle and asset checks

Spawn `performance-engineer` with the build output path and the budgets:
- Initial JS per route (gzipped) vs `budgets.js_initial_kb`: use the framework's build report (Next.js route table, Vite/Rollup visualiser, Nuxt `analyze`, Angular `stats.json`).
- The largest dependencies and whether they are needed on first load (moment, lodash, chart and editor libs, icon packs imported whole).
- Images over `budgets.image_max_kb`, missing `width`/`height`, no modern format, lazy-loading on the LCP image.
- Fonts: count, subsetting, `font-display`, preload of the main face.
- Third-party scripts loaded before interaction or before consent.
- Caching headers on static assets (`immutable`, long max-age) and HTML.

### Phase 4: Field data (optional)

If the user has CrUX, Vercel Speed Insights or analytics Web Vitals, ask them
to paste p75 LCP/INP/CLS. Field data outranks lab data when they disagree.

### Phase 5: Report

Write the report with the `perf-report` template: a budget table (route ×
metric, with ✅/❌ against the budget), findings ranked **Critical** (budget
blown on a key route) → **High** → **Medium** → **Low**. Each finding has
evidence (number, file:line or asset path), the likely cause, the fix, and the
expected gain. Ask "May I write this to `production/audits/perf-YYYY-MM-DD.md`?"

### Phase 6: Follow-up

Offer to turn Critical and High findings into stories (`/create-stories`) or
bugs (`/bug-report`). Create nothing without a yes.

## Output

`production/audits/perf-YYYY-MM-DD.md` (template: `.claude/docs/templates/perf-report.md`).

## Rigor

- `minimal`: home + one key route, Lighthouse only.
- `standard`: all key routes, bundle and asset checks.
- `full`: adds field data, a before/after comparison with the previous report, and a `TD-GATE` note for `/gate-check launch`.

## Next step

`/sprint-plan` to schedule the fixes, or `/launch-checklist` if everything is within budget.
