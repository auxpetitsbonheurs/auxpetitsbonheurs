---
name: design-tokens
description: "Generates docs/design/tokens.json in W3C design-tokens format (colour light/dark, typography, spacing, radius, shadow, motion) from the brand guide, checks contrast, and optionally wires tokens into CSS variables and the Tailwind theme. Use after the brand guide, or when theming or dark mode is needed."
argument-hint: "[optional: 'wire' to also implement CSS variables]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Design Tokens

Turns the brand guide into machine-readable tokens: the single source for
colours, type, spacing, radii, shadows and motion. With `wire`, it hands the
tokens to `tailwind-shadcn-specialist` (or `lead-frontend`) to implement as CSS
variables. It never invents colours that contradict the brand guide.

## Inputs

- `docs/design/brand-guide.md` (required; if missing, suggest `/brand-identity` and stop)
- Existing `docs/design/tokens.json` (update in place, preserving names)
- `project.yaml`: `stack.styling`, `stack.frontend`, `a11y.standard`
- `.claude/docs/templates/design-tokens.json` (structure)

## Phases

### Phase 1: Extract

Read the brand guide's colour, typography, motion and imagery sections. List
what is specified and what is missing (e.g. no neutral ramp, no dark palette).
Ask the user how to fill gaps, offering a recommendation.

If the `theme-factory` skill is installed, use it to generate coherent ramps and
dark variants from the brand colours; otherwise say so and derive ramps with
perceptual (OKLCH) steps.

### Phase 2: Build the token set

Use the W3C Design Tokens format (`$value`, `$type`, `$description`) with three layers:
1. **Primitive**: colour ramps (`color.brand.50…950`, `color.neutral.*`), font
   families, sizes, weights, line heights, spacing scale (4 px base), radii,
   shadows, durations and easings.
2. **Semantic**: roles referencing primitives, with light and dark values:
   `color.bg`, `color.fg`, `color.muted`, `color.border`, `color.primary`,
   `color.primary-fg`, `color.accent`, `color.success|warning|danger|info`,
   `color.ring`; `font.body`, `font.heading`; `type.scale.*` (a deliberate
   ratio); `motion.fast|base|slow`.
3. **Component** (only where needed): e.g. `button.radius`, `input.height`.

Map semantic names to shadcn/ui variable names (`--background`, `--foreground`,
`--primary`, `--ring`, …) when `stack.styling` is `tailwind-shadcn`.

### Phase 3: Check

- Contrast for every fg/bg semantic pair in light and dark: ≥ 4.5:1 text,
  ≥ 3:1 large text, UI components and focus rings. Print a table; fix failures.
- Type scale yields readable body (≥ 16 px) and line lengths under ~80 characters.
- Motion tokens include a reduced-motion value (0 ms or opacity-only).

### Phase 4: Approve and write

Show the token summary and the contrast table. Ask
"May I write this to `docs/design/tokens.json`?"

### Phase 5 (with `wire`): Implement

Spawn `tailwind-shadcn-specialist` (or `lead-frontend` for other styling) with
the token file and the instruction to: generate CSS variables for light and
dark themes, map them into the Tailwind theme (confirm v3 config vs v4 `@theme`
from the installed version), and list every file it will change. It asks the
user before writing.

## Output

`docs/design/tokens.json` (from `.claude/docs/templates/design-tokens.json`);
with `wire`, CSS/theme files in the code root after separate approval.

## Next step

`/design-system`, or `/design-tokens wire` once the system is agreed.
