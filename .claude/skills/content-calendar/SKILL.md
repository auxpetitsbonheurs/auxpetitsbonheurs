---
name: content-calendar
description: "Builds a content calendar from the content strategy and SEO opportunities: topics, search intent, format, target keyword, owner, publish dates and internal links, sized to the user's real capacity. Use when planning blog, docs, landing or social content."
argument-hint: "[weeks, default 8]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, WebSearch, Bash(bash .claude/scripts/*)
model: sonnet
---

# Content Calendar

Writes `docs/content/content-calendar.md` (template
`.claude/docs/templates/content-calendar.md`). Run by `content-lead` with
`seo-specialist`. It plans; it does not publish, schedule posts or contact anyone.

## Inputs

- `docs/content/content-strategy.md` (audiences, goals, pillars); missing → suggest `/content-strategy`
- `docs/product/personas/`, `docs/product/prd.md` positioning
- `docs/content/sitemap.md` (existing pages for internal links)
- Latest `production/audits/seo-*.md` if present
- `project.yaml`: `i18n.locales`, `stack.cms`

## Phases

### Phase 1: Capacity

Ask: "How many hours a week can go to content?" and "Which formats?"
(`Blog posts`, `Docs/guides`, `Landing pages (use cases, comparisons)`, `Changelog/updates`; multi-select).
Rough sizing: a 1,200-word post ≈ 3–4 h including edit; a comparison page ≈ 4–6 h.

### Phase 2: Topics (parallel)

Spawn:
- `seo-specialist`: topic clusters per pillar, search intent (informational, commercial, transactional), a target keyword per piece, and quick wins (pages ranking 8–20 that need refreshing). Keyword volumes must be labelled as estimates unless the user supplies tool data.
- `content-lead`: topics from personas' questions, objections and jobs-to-be-done; product-led pieces (how to do X with the product).

### Phase 3: Prioritise and schedule

Score each piece: business value (close to the product) × ranking feasibility
÷ effort. Fit the top pieces to the capacity across the requested weeks,
mixing pillar pages and supporting posts. Each row: date, title (working),
format, pillar, intent, keyword, CTA, internal links to/from, owner
(user / `copywriter` draft), status.

### Phase 4: Write

Show the calendar and ask "May I write this to `docs/content/content-calendar.md`?"

## Rigor

`minimal`: 4-week list without keyword research. `standard`/`full`: as above.

## Next step

Draft the first piece with `copywriter`; `/seo-audit` after a month of publishing.
