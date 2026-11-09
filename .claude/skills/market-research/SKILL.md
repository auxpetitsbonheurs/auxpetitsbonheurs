---
name: market-research
description: "Researches the market for the product idea: segments, size estimates, demand signals, pricing norms, channels and trends, with cited sources and labelled estimates. Use during discovery to test whether a market exists and how to reach it, or before pricing decisions."
argument-hint: "[focus: size | pricing | channels | trends | all]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, WebSearch, WebFetch
model: sonnet
---

# Market research

Produces `docs/product/research/market.md` from
`.claude/docs/templates/market-research.md`. Every number cites a source or is
labelled an estimate with its method. It never invents data, surveys, quotes or
users.

## Inputs

- `docs/product/brief.md` (required: stop and suggest `/brainstorm` if missing)
- `docs/product/prd.md` and `docs/product/personas/*` if present
- Argument: a focus area (default `all`)

## Phases

### Phase 1: Frame the questions

From the brief, list 4–6 research questions (e.g. "How many independent dog
groomers operate in the UK?", "What do booking tools charge them?", "Where do
they look for software?"). Ask the user to add, remove or reprioritise, and
which geographies matter.

### Phase 2: Research

Spawn `ux-researcher` with the questions and the brief. Brief: "Use WebSearch
and WebFetch on public sources (industry reports, government statistics,
pricing pages, communities, app marketplaces, search-trend tools). For each
question give findings with source URL and date, and a confidence level.
Estimate market size top-down **and** bottom-up when possible, showing the
arithmetic. Label estimates. Do not fabricate."

### Phase 3: Synthesise

Draft the report:
- **Segments** and the beachhead segment (with reasoning)
- **Size**: TAM / SAM / SOM with method and assumptions
- **Demand signals**: search interest, community activity, competitor traction
- **Pricing norms**: ranges seen, model (per seat, usage, flat), free tiers
- **Channels**: where these users discover tools (SEO terms, marketplaces, communities, partners)
- **Trends and risks**
- **Implications for the PRD**: 3–5 concrete recommendations

Show it and ask "May I write this to `docs/product/research/market.md`?"

## Output

`docs/product/research/market.md`.

## Next step

`/competitor-audit`, then `/write-prd`.
