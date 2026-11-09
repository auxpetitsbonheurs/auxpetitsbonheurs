---
name: design-system
description: "Writes the design system: component inventory, variants, states and usage rules derived from the feature specs and UX flows, mapped to shadcn/ui when the stack uses it. Use after the brand guide exists, when new components keep appearing ad hoc, or before building UI."
argument-hint: "[optional: 'update' to add components for new specs]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Design System

Produces `docs/design/design-system.md`: the components the product actually
needs, each with variants, states, accessibility behaviour and usage rules. It
does not write tokens (`/design-tokens`) or component code (that happens in
`/dev-story` via `ui-engineer` and `tailwind-shadcn-specialist`).

## Inputs

- `docs/design/brand-guide.md` (required; if missing, suggest `/brand-identity` and stop)
- `docs/design/tokens.json` if present (components reference token names)
- `docs/design/ux/*.md` and `docs/specs/features/*.md` UX sections (what screens need)
- `project.yaml`: `stack.styling`, `stack.frontend`, `a11y.standard`
- Existing `docs/design/design-system.md` when the argument is `update`

## Phases

### Phase 1: Inventory what the product needs

Grep the UX docs and feature specs for screens, controls and patterns. Build a
table: component → where it is needed (file + section) → priority (MVP / later).
Group into: foundations (layout, grid, typography), primitives (button, input,
select, checkbox, radio, switch, textarea, label), feedback (toast, alert,
dialog, tooltip, skeleton, progress, empty state), navigation (header, nav,
tabs, breadcrumbs, pagination, command menu), data display (card, table,
badge, avatar, list, stat), forms (field + error + hint pattern, form layout),
and domain components (pricing table, checkout summary, editor, etc.).

Show the inventory and ask the user to confirm MVP scope.

### Phase 2: Map to the component library

When `stack.styling` is `tailwind-shadcn`, spawn `tailwind-shadcn-specialist`
to map each primitive to a shadcn/ui component (or "custom: built from Radix
X") and note customisation needed. Otherwise spawn `lead-frontend` to map to the
project's library or to native elements.

### Phase 3: Specify each component

Spawn `ui-designer` and `accessibility-specialist` in parallel. For each MVP
component record:
- Purpose and when **not** to use it
- Variants (e.g. button: primary, secondary, ghost, destructive, link) and sizes
- States: default, hover, focus-visible, active, disabled, loading, error, selected
- Token usage (colour roles, radius, spacing, motion) by token name
- Accessibility: element/role, keyboard behaviour, focus management, labelling
- Content rules with `copywriter` (button verbs, error message pattern)
- Library mapping from Phase 2

Add global rules: one primary action per view, spacing scale only, icon sizes,
dark-mode behaviour, responsive breakpoints, and the process for adding a new
component (proposal to `design-director` with need, variants, states).

### Phase 4: Approve and write

Show the document and ask "May I write this to `docs/design/design-system.md`?"
On `update`, show only the diff of added or changed components.

## Output

`docs/design/design-system.md` from `.claude/docs/templates/design-system.md`.

## Rigor

- `minimal`: primitives and feedback only; states listed briefly.
- `standard`: full MVP inventory with states and accessibility notes.
- `full`: as standard, plus `DD-SYSTEM` verdict from `design-director`.

## Next step

`/design-tokens` if `tokens.json` is missing, otherwise `/ux-flow` or `/feature-spec`.
