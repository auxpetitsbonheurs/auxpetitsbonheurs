---
name: cro-review
description: "Conversion-rate review of a landing, pricing, signup or checkout page: clarity, friction, trust, speed and accessibility, with ranked fixes and experiment candidates. Use when a key page underperforms, before launch, or before a growth sprint."
argument-hint: "<page url or route> [landing | pricing | signup | checkout]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# CRO Review

Reviews one page and writes `production/audits/cro-<page>-YYYY-MM-DD.md`.
It can look at the running page (local dev server or a preview URL) through
the Playwright MCP if it is installed; otherwise it reviews the source and
any screenshots the user provides. It never proposes dark patterns.

## Inputs

- The route or URL (argument) and page type (asked if missing)
- The page's source (component/route files), its feature spec and UX doc
- `docs/design/brand-guide.md` voice section, `docs/product/personas/`
- Funnel numbers for the page if `/funnel-review` has run

## Phases

### Phase 1: See the page

With Playwright MCP: open the page at 390×844 (mobile) and 1440×900
(desktop), capture above-the-fold screenshots, the full page, and the
Lighthouse/Web Vitals numbers if available. Without it: read the source and
ask for screenshots. Say which mode you used.

### Phase 2: Review (parallel)

Spawn:
- `growth-lead`: the checklist below for the page type
- `copywriter`: headline, value proposition, CTA copy, objection handling (2–3 alternative headlines)
- `ux-lead`: friction (fields, steps, errors, focus order)
- `accessibility-specialist`: contrast, labels, keyboard path through the conversion action

### Phase 3: Checklist by page type

| Type | Check |
|---|---|
| All | One primary CTA above the fold; the value is clear in 5 seconds; social proof near the CTA; LCP < budget on mobile; no layout shift on the CTA |
| landing | Headline says outcome for the persona; specific proof (numbers, logos the user confirms are real); objections answered; CTA repeated after long sections |
| pricing | Plans comparable at a glance; recommended plan marked honestly; annual/monthly toggle clear; what happens after the trial stated; FAQ on billing and cancellation |
| signup | Minimal fields; social/passkey/magic-link options per `stack.auth`; inline validation; password rules shown up front; no forced email confirmation before first value where safe |
| checkout | Guest checkout (ecommerce); total cost incl. tax and shipping shown before the last step; trusted payment UI; address autocomplete; errors keep entered data |

### Phase 4: Guardrails

Reject and do not suggest: fake scarcity or countdowns, confirm-shaming,
pre-ticked add-ons, hidden costs, hard-to-find cancellation, fabricated
testimonials or numbers. If the page already has one, report it as a finding.

### Phase 5: Report

Findings ranked by ICE, each tagged `quick fix`, `experiment` or `research`,
with the evidence (screenshot, file:line). Ask "May I write this to
`production/audits/cro-<page>-YYYY-MM-DD.md`?"

## Output

`production/audits/cro-<page>-YYYY-MM-DD.md`

## Next step

`/experiment` for the top `experiment` finding; `/dev-story` for quick fixes.
