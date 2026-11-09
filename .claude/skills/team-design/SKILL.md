---
name: team-design
description: "Orchestrates the design department (design-director, ux-lead, ui-designer, copywriter, accessibility-specialist) from the brief and PRD to brand identity, design system, sitemap and key user flows. Use at the start of the Design stage, or when redesigning."
argument-hint: "[brand | system | flows | all]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Team: Design

Runs the design stage end to end, calling the individual skills' logic in
order: `/brand-identity` → `/design-system` (+ `/design-tokens`) →
`/sitemap` → `/ux-flow` for key journeys → `/ux-review`. The user picks the
direction at every fork; nothing is written without approval.

## Inputs

- `docs/product/brief.md`, `docs/product/prd.md`, `docs/product/personas/`
- Existing `docs/design/` and `docs/content/` files (to update, not replace, unless asked)
- `project.yaml`: `project.type`, `stack.styling`, `a11y.standard`, `i18n.locales`

## Agents

| Agent | Role here |
|---|---|
| `design-director` | Direction, quality bar, `DD-BRAND` / `DD-SYSTEM` verdicts |
| `ui-designer` | Visual directions, components, motion |
| `ux-lead` | Sitemap, flows, wireframes |
| `copywriter` | Voice samples, headlines, microcopy |
| `accessibility-specialist` | Contrast, focus, target sizes, motion |

External skills used if installed: `frontend-design`, `theme-factory`,
`web-design-guidelines`, `web-artifacts-builder` (see `docs/RECOMMENDED-SKILLS.md`).

## Phases

### Phase 1: Brand directions (parallel)

`ui-designer` proposes 2–3 distinct visual directions grounded in the
product's subject and audience (type pairing, palette, layout feel, imagery);
`copywriter` writes a voice sample and a hero headline for each. Present
them side by side (optionally as HTML mockups). The user chooses or mixes.

### Phase 2: Brand guide + design system

`design-director` writes the brand guide; `ui-designer` turns it into tokens
and the component inventory the specs need; `accessibility-specialist`
checks contrast for light and dark themes and focus styles **before** the
user sees the final draft. `design-director` gives `DD-BRAND` and `DD-SYSTEM`
verdicts. Ask before writing `docs/design/brand-guide.md`,
`docs/design/design-system.md` and `docs/design/tokens.json`.

Skip brand work for `project.type: api` (offer a docs-site theme only).

### Phase 3: IA and flows (parallel)

- `ux-lead`: sitemap and navigation (`docs/content/sitemap.md`), then flows for the PRD's critical journeys (signup, onboarding, core task, checkout/upgrade, settings)
- `copywriter`: microcopy for those flows (labels, empty states, errors)

### Phase 4: Review

`ux-lead` runs the usability heuristics and `accessibility-specialist` the
a11y lens on the flows; `design-director` gives a `DD-REVIEW` verdict.
Findings go back to the owners once; remaining concerns go to the user.

### Phase 5: Report

List what was written, the verdicts, open questions, and any agent that was
BLOCKED. Append a checkpoint note.

## Next step

`/feature-spec` for each feature, then `/gate-check design`.
