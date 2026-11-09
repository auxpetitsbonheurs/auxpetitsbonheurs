---
name: competitor-audit
description: "Audits direct and indirect competitors' positioning, pricing, features, onboarding, UX patterns, SEO footprint and reviews from public information, and identifies gaps to exploit. Use during discovery, before designing a landing page or pricing, or when the user names a competitor."
argument-hint: "[competitor names or URLs]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, WebSearch, WebFetch
model: sonnet
---

# Competitor audit

Produces `docs/product/research/competitors.md` from
`.claude/docs/templates/competitor-analysis.md`, based on public information
only. It never signs up for accounts, scrapes behind logins, or contacts
competitors.

## Inputs

- `docs/product/brief.md` (required)
- Argument: competitor names/URLs; otherwise propose 3–6 (direct, indirect, and "what users do today" alternatives such as spreadsheets) and ask the user to confirm the list

## Phases

### Phase 1: Choose competitors

Propose the list with a one-line reason each and the category (direct /
indirect / substitute). Ask the user to confirm or edit (max 6).

### Phase 2: Audit in parallel

Spawn one `ux-researcher` per 2–3 competitors (in parallel). Brief each with
the dimensions below, "public sources only, cite URLs and dates, separate
facts from impressions", and the output format (one section per competitor).

| Dimension | What to capture |
|---|---|
| Positioning | Hero headline, target user, key promise |
| Pricing | Plans, prices, limits, free tier/trial, billing model |
| Features | Core features vs. the brief's core loop |
| Onboarding | Steps from landing to value (from public demos/docs/videos) |
| UX patterns | Navigation, notable interactions, mobile experience |
| SEO footprint | Main keywords they rank for (from public tools/search), content types |
| Reviews | Recurring praise and complaints (G2, Capterra, app stores, Reddit) with links |
| Tech signals | Public stack hints (optional) |

### Phase 3: Synthesise

Draft: a comparison matrix, each competitor's strengths/weaknesses, **gaps and
opportunities** (unserved segments, recurring complaints, pricing holes), and
**implications** for positioning, the MVP scope and the landing page. Show it
and ask "May I write this to `docs/product/research/competitors.md`?"

## Output

`docs/product/research/competitors.md`.

## Next step

`/personas` or `/write-prd`.
