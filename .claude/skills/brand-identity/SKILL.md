---
name: brand-identity
description: "Creates the brand guide: personality, voice, colour, typography, imagery and motion principles, from 2–3 distinct directions the user chooses between. Use when starting visual design, rebranding, or when the site looks generic or templated."
argument-hint: "[optional: mood words or reference sites]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, WebFetch, Agent, Bash(bash .claude/scripts/*)
model: opus
---

# Brand Identity

Produces `docs/design/brand-guide.md`: the source every visual and verbal
decision is checked against. It proposes distinct directions grounded in the
product's subject and audience, lets the user pick, then details only the
chosen one. It never writes tokens or code (that is `/design-tokens`), and it
never invents logos the user must license.

## Inputs

- `docs/product/brief.md` and `docs/product/prd.md` (problem, audience, positioning)
- `docs/product/personas/*.md` (who must trust and enjoy this)
- `docs/product/research/*.md` competitor notes, if any (what to stand apart from)
- `project.yaml`: `project.type`, `a11y.standard`
- Arguments: mood words or reference URLs from the user (optional)

If neither a brief nor a PRD exists, say so and suggest `/brainstorm` or
`/write-prd` first. Continue only if the user describes the product in chat.

## Phases

### Phase 1: Ground the brand in the subject

Read the inputs by section. Write a five-line summary for the user: subject,
audience, primary job of the site, the one feeling a first-time visitor should
have, and what competitors look like (so we know what *not* to look like).
Ask whether anything is wrong before continuing.

### Phase 2: Ask the few questions that matter

Ask with the question tool (max 4 at once):
- Existing assets to keep? (logo, colours, fonts, none)
- Personality sliders: playful ↔ serious, classic ↔ cutting-edge, quiet ↔ loud
- Any hard constraints? (corporate palette, dark-mode-first, print, a reference brand to avoid)
- Imagery: photography, illustration, 3D, product screenshots, type-only

### Phase 3: Propose 2–3 directions

Spawn `design-director` (direction and rationale) and `ui-designer` (concrete
palette, type pairing, layout motif) in parallel with the summary and answers.
If the `frontend-design` skill is installed, tell both agents to apply it;
otherwise say it is missing and use the checklist below.

Each direction states: a name, one-sentence idea, palette (hex, with roles),
type pairing (real, licensable families such as Google Fonts or the user's own),
layout/graphic motif, imagery style, motion character, sample headline in the
voice, and why it fits *this* subject. Directions must differ in kind, not just hue.

Reject templated tells before presenting:
- generic gradient hero with a big number + small label
- accenting one word of a headline in another colour or italic
- all-caps eyebrow labels above every section
- numbered 01/02/03 markers on content that is not a sequence
- default system font stack or the same two fonts every SaaS uses, without a reason

Check every palette's text/background pairs against WCAG 2.2 AA (4.5:1 body,
3:1 large text and UI) in light and dark. Flag failures with the fix.

Present the directions and ask the user to pick one, combine, or redirect.

### Phase 4: Detail the chosen direction

Fill `.claude/docs/templates/brand-guide.md`: personality and principles, voice
and tone (with `content-lead`: do/don't examples for marketing, UI, errors),
logo usage (or "wordmark in <font>" if none), colour roles (primary, accent,
neutral ramp, semantic success/warning/danger/info) for light and dark, type
families and roles, imagery and iconography rules, motion principles (durations
in ranges; reduced-motion behaviour), and accessibility commitments.

### Phase 5: Approve and write

Show the guide (or a precise summary if long) and ask
"May I write this to `docs/design/brand-guide.md`?" On yes, write it and
append a line to `production/session-state/active.md`.

## Output

`docs/design/brand-guide.md` from `.claude/docs/templates/brand-guide.md`.

## Rigor

- `minimal`: one direction refined with the user instead of three; short guide.
- `standard`: 2–3 directions; full guide.
- `full`: as standard, plus a `DD-BRAND` verdict from `design-director` recorded at the end of the guide.

## Next step

`/design-tokens` to turn the guide into `tokens.json`, then `/design-system`.
