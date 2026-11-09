---
name: wireframe
description: "Creates low-fidelity wireframes for the screens of a flow or page: layout regions, content priority, components and states, as structured markdown or a clickable HTML mockup. Use after a UX flow exists, before visual design or implementation."
argument-hint: "<flow-slug or page name> [--html]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Wireframe

Settles structure and priority before pixels. Produces wireframes for each
screen of a flow in `docs/design/ux/<slug>-wireframes.md`, or with `--html` a
clickable low-fi mockup in `docs/design/ux/<slug>/`. Wireframes are greyscale
and use real (draft) content, never lorem ipsum. They are not production code.

## Inputs

- Argument: a flow slug (`docs/design/ux/<slug>.md`) or a page from `docs/content/sitemap.md`
- `docs/design/design-system.md` (use its component names where it exists)
- `docs/design/brand-guide.md` voice section (for draft copy)
- `docs/product/personas/*.md` (primary device)

If no flow or sitemap entry exists, suggest `/ux-flow` first; continue only if
the user describes the screens.

## Phases

### Phase 1: Screen list

From the flow's step table, list each distinct screen and the states that need
their own wireframe (empty, error, loading, success). Ask the user to confirm
which to draw.

### Phase 2: Draft

Spawn `ux-lead` (structure and priority) and `copywriter` (draft headings,
labels, CTAs, error text) in parallel. For each screen, at mobile (375 px) and
desktop (1280 px) widths, describe:

```
Screen: <name>   Route: <url>   Purpose: <one line>
[Header]   logo · nav (items) · account menu
[Main]
  1. <region>: <component from design system> — <content> — <priority>
  2. ...
[Primary action] <button label> → <next step>
States: empty → <what shows>; error → <where and wording>; loading → <skeleton>
A11y: heading order, landmark, focus target on load
```

Number regions in reading order; that order is the DOM and focus order.

### Phase 3 (with `--html`): Clickable mockup

If the `web-artifacts-builder` skill is installed, use it; otherwise build
plain HTML + minimal CSS by hand. One HTML file per screen (or one file with
anchors), linked in flow order, greyscale, system font, real draft copy, no
JavaScript beyond navigation. Mark the folder as a mockup in a `README.md`.

### Phase 4: Review and write

Check each screen has one primary action, the states from Phase 1, and that
nothing in it is outside the PRD. Show the result and ask
"May I write this to `docs/design/ux/<slug>-wireframes.md`" (and the mockup folder)?

## Output

`docs/design/ux/<slug>-wireframes.md` from `.claude/docs/templates/wireframe-brief.md`;
with `--html`, `docs/design/ux/<slug>/*.html` + `README.md`.

## Next step

`/ux-review <slug>` for a usability check, then `/feature-spec`.
