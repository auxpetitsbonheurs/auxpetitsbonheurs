---
name: content-strategy
description: "Writes the content strategy with the content lead: audiences, messaging hierarchy, page inventory with goals, content types and models, voice application, SEO themes, ownership and cadence. Use for marketing sites, blogs, docs and any CMS-driven content, or before writing landing page copy."
argument-hint: "[optional: 'update']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, WebSearch, Bash(bash .claude/scripts/*)
model: sonnet
---

# Content Strategy

Produces `docs/content/content-strategy.md`: what the site says, to whom, in
what form, and how it stays current. It does not write final copy (that is
`copywriter` during build) or publish anything.

## Inputs

- `docs/product/brief.md`, `docs/product/prd.md`, `docs/product/personas/*.md`
- `docs/design/brand-guide.md` (voice and tone)
- `docs/content/sitemap.md` (page inventory), research in `docs/product/research/`
- `project.yaml`: `project.type`, `stack.cms`, `i18n.locales`

## Phases

### Phase 1: Goals and audiences

State the content's business goals (sign-ups, sales, support deflection,
authority) and map each persona to the questions they arrive with at each stage
(aware → considering → deciding → using). Ask the user to confirm priorities.

### Phase 2: Messaging hierarchy

Spawn `content-lead` to draft: the value proposition (one sentence), three to
five supporting pillars with proof points (only claims the user can verify;
mark unverified ones), objections and their answers, and the words to use and
avoid (aligned with the brand guide).

### Phase 3: Inventory, formats and SEO

In parallel spawn `seo-specialist` (keyword themes and search intent per page
or cluster, internal linking, which content types earn search traffic) and
`content-lead` (formats: landing pages, feature pages, comparisons, blog,
guides, docs, changelog, case studies). Produce a page/content table:

| Page or type | Goal | Persona & stage | Key message | Search intent | Format | Owner | Update cadence |

### Phase 4: Content model (if a CMS or MDX is used)

If `stack.cms` is set, spawn `cms-specialist` with `content-lead` to define
content types, fields (required SEO fields, alt text), references and locales.

### Phase 5: Approve and write

Show the strategy and ask "May I write this to `docs/content/content-strategy.md`?"

## Output

`docs/content/content-strategy.md` from `.claude/docs/templates/content-strategy.md`.

## Rigor

- `minimal`: messaging hierarchy + page table.
- `standard`/`full`: adds SEO themes, content model and governance.

## Next step

`/sitemap` if the IA is not settled, else `/content-calendar` once launched.
