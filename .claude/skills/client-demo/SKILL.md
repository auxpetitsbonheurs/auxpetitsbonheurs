---
name: client-demo
description: "Builds a Figma-style, high-fidelity clickable demo of the product (branded screens, real copy, hotspot navigation, device and state toggles, a guided feature tour, presenter notes) as a static site to show clients or stakeholders the first look and key features. Use to pitch or align on a direction before building, after brand and flows exist, or when the user asks for a mockup or demo to show someone."
argument-hint: "[pitch | review | feedback] [slug]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npx --yes serve*), Bash(npx --yes playwright*), Bash(node *), Bash(zip *)
model: sonnet
---

# Client Demo

Produces a polished, clickable demo that looks like the real product: branded
screens with real copy and believable sample data, linked by hotspots like a
Figma prototype. It is a static site in `docs/design/demo/<slug>/` that opens
from disk or any static host. It is **a demo, not the product**: no backend, no
real data, no tracking. It never deploys or sends anything; it prints the
commands to share it.

## Inputs

- `docs/product/brief.md`, `docs/product/prd.md` (features to show, audience)
- `docs/design/brand-guide.md`, `docs/design/tokens.json`, `docs/design/design-system.md`
- `docs/content/sitemap.md`, `docs/design/ux/*` (flows, wireframes), `docs/specs/features/*`
- Client-supplied assets the user points to (logo, photos, existing site). Never invent a real company's logo or branding.
- Mode argument:
  - `pitch`: early, from the brief alone; 3–6 screens to win or align a client. Missing brand → propose a direction first.
  - `review` (default): the key flows of the PRD at high fidelity, built on the brand guide and tokens.
  - `feedback <slug>`: turn client feedback on an existing demo into changes.

## Phases

### Phase 1: Scope the demo

Read the inputs by section. Propose, in one message:

- **Audience and goal** (e.g. "client sign-off on look and the booking flow")
- **Screens** (5–12): the landing/home, the core task flow end to end, one
  dashboard or account screen, plus pricing/checkout if the PRD has them
- **Feature tour**: 3–7 PRD features to call out, each tied to a screen
- **Devices**: desktop + mobile by default
- **States to show**: e.g. empty dashboard, form error, success

If there is no brand guide: in `pitch` mode, brief `design-director` and
`ui-designer` for 2 quick directions and let the user pick (use the
`frontend-design` skill if installed); in `review` mode, suggest
`/brand-identity` first and stop unless the user wants to proceed.
Ask "Does this scope work?" and wait.

### Phase 2: Content

Brief `copywriter` (in parallel with Phase 3's layout work) for real headlines,
UI copy and microcopy in the brand voice, and believable sample data that is
clearly fictional (no real people, customers, logos or testimonials unless the
user supplies them). No lorem ipsum.

### Phase 3: Build the screens

Brief `ui-designer` for the visual design and `ui-engineer` for the build,
with `ux-lead` defining hotspots from the flows. Use `web-artifacts-builder`
if installed; otherwise hand-written HTML/CSS. Structure:

```
docs/design/demo/<slug>/
  index.html        start page: title, screen map (thumbnails), "Start tour"
  screens/*.html    one file per screen (and per state where needed)
  assets/tokens.css CSS variables generated from docs/design/tokens.json
  assets/demo.css   layout and components (mirror the design-system names)
  assets/demo.js    hotspots, device toggle, state toggle, tour, keyboard nav
  assets/img/       optimised images (client-supplied or neutral placeholders)
  notes.md          presenter notes: talking points per screen, open questions
  feedback.md       feedback form for the client (screen, comment, priority)
  README.md         what this is, how to open and share it, what it is not
```

Behaviour of `demo.js` (no framework, no external requests):

- **Hotspots**: clickable elements navigate to the next screen; `H` toggles
  hotspot highlighting (like Figma's prototype hints)
- **Device toggle**: desktop / tablet / mobile frame widths
- **State toggle**: switch a screen between its designed states
- **Tour**: numbered callouts for each feature, Next/Back, with the PRD feature name
- **Keyboard**: arrows move through the tour; Esc closes overlays
- A small fixed footer: "Interactive prototype: not a working product"

Screens use semantic HTML and the brand's tokens (light and dark if the brand
defines both), meet contrast requirements, and are responsive. Each screen must
work with no network connection.

### Phase 4: Verify

- Check every hotspot link resolves (walk the files; no broken links)
- If Playwright is available: open each screen at 1440 px and 390 px, capture
  screenshots to `docs/design/demo/<slug>/screenshots/` (for a PDF or deck),
  and run an axe check; report contrast or label problems
- Run `/design-review docs/design/demo/<slug>` (DD-REVIEW) before sharing

### Phase 5: Hand off

Ask "May I write the demo to `docs/design/demo/<slug>/`?" (one approval for the
changeset; under `modes.automation: auto` the orchestrated write is allowed).
Then print how to share it, without running anything outward-facing:

- Local: `npx --yes serve docs/design/demo/<slug>` then open the URL
- File: `zip -r <slug>-demo.zip docs/design/demo/<slug>` and send the zip
- Hosted: a static preview deploy via `/deploy-setup` (the user runs the deploy)
- Figma: import the screenshots into a Figma file for comments; if the Figma MCP
  server is connected, existing Figma frames can be read as input instead

### Mode `feedback <slug>`

Read `docs/design/demo/<slug>/feedback.md` (or feedback the user pastes).
Classify each item: visual tweak (fix in the demo), content (copy), flow change
(UX flow + spec), scope change (PRD). Show the list with proposed owners; on
approval, apply demo fixes and route doc changes through
`/propagate-design-change`. Record decisions in `notes.md`.

## Output

`docs/design/demo/<slug>/` as above; optional screenshots. Decisions from
feedback flow into the brand guide, UX flows, specs or PRD.

## Rigor

- `minimal`: hotspots and screens only; tour and state toggle optional.
- `standard`: everything above; link check and design review required.
- `full`: plus axe on every screen and `design-director` sign-off before sharing.

## Next step

After sign-off: `/working-prototype` to test the journeys by hand, then `/design-system` and `/feature-spec` (the demo is a reference,
not code to reuse; production UI is built through `/dev-story`).
