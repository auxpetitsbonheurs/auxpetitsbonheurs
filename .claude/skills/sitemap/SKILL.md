---
name: sitemap
description: "Designs the information architecture: page inventory, hierarchy, navigation, URL structure and the search intent of each page. Use when planning a new site or app's structure, adding sections, or restructuring navigation or URLs."
argument-hint: "[optional: 'update']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Sitemap & Information Architecture

Produces `docs/content/sitemap.md`: every page, where it sits, how users reach
it, its URL, whether it is indexed and what search intent it serves. It does not
write page copy (`/content-strategy`, `copywriter`) or flows (`/ux-flow`).

## Inputs

- `docs/product/prd.md` (features and audiences), `docs/product/personas/*.md`
- `docs/content/content-strategy.md` if present
- `project.yaml`: `project.type`, `i18n.locales`, `stack.frontend`
- For brownfield projects: the existing route files (Glob `app/**/page.*`,
  `pages/**`, `src/routes/**`, `routes/**`) and any `sitemap.xml`

## Phases

### Phase 1: Inventory

Build the page list from the PRD and personas, grouped by area:
- **Marketing** (home, features, pricing, about, blog, docs, legal, contact)
- **Auth** (sign in, sign up, reset, verify, invite accept)
- **App** (dashboard, core objects list/detail/new/edit, settings, billing, team)
- **Commerce** (catalogue, category, product, cart, checkout, order confirmation, account/orders)
- **System** (404, 500, maintenance, status)

For brownfield, list existing routes and mark keep / change / remove.

### Phase 2: Structure and URLs

Spawn `ux-lead` (hierarchy, navigation, depth ≤ 3 clicks to any key task),
`seo-specialist` (URL conventions, canonical rules, indexability, hreflang) and
`content-lead` (page purpose and audience) in parallel. Merge into:
- A hierarchy tree (indented list or mermaid `graph TD`)
- Primary nav, footer nav, app sidebar and account menu contents
- URL patterns: lowercase, hyphenated, no trailing-slash ambiguity, stable IDs or
  slugs for objects (`/projects/[id]`), locale strategy (`/de/...` or domain)
- Per page: purpose, audience, primary CTA, indexed (yes/no), target search
  intent / keyword theme, rendering hint (static, ISR, dynamic, client)

Rules: app and auth pages `noindex`; one canonical per page; legacy URLs get
301s listed in a redirects table.

### Phase 3: Approve and write

Show the tree, the nav and the page table. Ask the user to confirm or adjust,
then "May I write this to `docs/content/sitemap.md`?"

## Output

`docs/content/sitemap.md` from `.claude/docs/templates/sitemap.md`.

## Rigor

- `minimal`: tree + URL table only.
- `standard`/`full`: adds nav specs, SEO intent and the redirects table.

## Next step

`/ux-flow` for the key journeys, or `/content-strategy` for marketing-heavy sites.
