---
name: personas
description: "Creates evidence-labelled personas with jobs-to-be-done, triggers, goals, pains, objections and the words users use, plus interview guides to validate them. Use during discovery, before writing the PRD or designing flows, or when the target user is fuzzy."
argument-hint: "[number of personas, default 2]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, WebSearch
model: sonnet
---

# Personas

Writes `docs/product/personas/<slug>.md` per persona from
`.claude/docs/templates/persona.md`. Each claim is labelled **evidence** (with
source) or **assumption**. It never invents quotes or pretends interviews
happened.

## Inputs

- `docs/product/brief.md` (required)
- `docs/product/research/*.md` if present (evidence source)
- Anything the user knows from real conversations (ask in Phase 1)
- Argument: number of personas (default 2: a primary and a secondary; 3 max)

## Phases

### Phase 1: Gather what is known

Ask: "Have you talked to people with this problem? Share anything they said,"
and "Who is the buyer vs. the user, if different?" Note the answers as evidence.

### Phase 2: Draft

Spawn `ux-researcher` with the brief, research and the user's notes. Each persona:
- Name + role label (e.g. "Solo groomer Sam"), segment, context
- **Job to be done**: "When <situation>, I want to <motivation>, so I can <outcome>"
- Trigger moment and current alternative
- Goals, pains, objections to switching
- Vocabulary: words they would search and use (useful for copy and SEO)
- Tech comfort and devices (drives mobile/a11y priorities)
- What success looks like for them (links to PRD metrics)
- Evidence vs assumption labels on every section

### Phase 3: Validate plan

Add, at the end of each persona, an **interview guide**: 6–8 open, non-leading
questions to confirm the assumptions, and the 3 assumptions most worth testing.

Show the personas and ask "May I write these to `docs/product/personas/`?"

## Output

`docs/product/personas/<slug>.md` (one per persona).

## Rigor

- `minimal`: one persona, no interview guide.
- `full`: at least two personas, and the PRD gate expects evidence labels on every section.

## Next step

`/write-prd`.
