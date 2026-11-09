---
name: scope-check
description: "Checks the MVP scope against the user's real capacity and deadline, estimates each feature roughly, and proposes cuts or phasing until it fits. Use after writing the PRD, when a deadline is set, when scope grows, or when someone asks 'can I ship this by X?'."
argument-hint: "[deadline YYYY-MM-DD] [hours per week]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, AskUserQuestion, Agent
model: sonnet
---

# Scope check

Compares what the PRD (or current backlog) asks for with the time actually
available, and helps the user cut to fit. It records the result as the PRD's
`## Scope` MVP cut. It never removes a feature without the user's decision.

## Inputs

- `docs/product/prd.md` scope and FR sections (required)
- `production/epics/*`, `bash .claude/scripts/story-list.sh` if build has started (use story estimates instead of rough ones)
- Arguments or questions: deadline and weekly hours; experience with the stack

## Phases

### Phase 1: Capacity

Ask for weekly hours, the deadline (or "none"), and planned time off. Compute
available hours = weeks × hours × 0.8 (focus factor). Say the formula.

### Phase 2: Rough size

Spawn `producer` and `technical-director` in parallel:
- `technical-director`: size each MVP feature as S (≤ 8 h), M (8–24 h), L (24–60 h), XL (> 60 h), including tests, and name the riskiest.
- `producer`: add the fixed costs often forgotten: setup, auth, deploy/CI, design system, legal pages, launch audits, content (typically 20–30% on top).

Use the midpoint of each size for the total, and show a low–high range.

### Phase 3: Compare and cut

Show a table: feature, value (from the PRD), size, cumulative hours, and
whether it fits. If it does not fit, propose cuts in this order: features
that do not serve the North Star → nice-to-have polish → manual instead of
automated (e.g. invoice by hand, admin via DB GUI) → scaled-down versions →
moving the deadline. Never cut tests, security or accessibility to fit.

Ask the user to choose cuts (multi-select).

### Phase 4: Record

Show the new MVP list and the "later" list, and ask "May I update the PRD's
Scope section?" Append a changelog line.

## Output

Edited `## Scope` (and `## Changelog`) in `docs/product/prd.md`.

## Next step

`/gate-check discovery`, or `/estimate` for a detailed estimate.
