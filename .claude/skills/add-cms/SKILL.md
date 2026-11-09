---
name: add-cms
description: "Adds a headless CMS (Sanity, Payload, Strapi, Contentful) or MDX content: content model, typed queries, draft preview, webhook revalidation, images and SEO fields. Use for marketing pages, blogs, docs, landing pages or any content the founder should edit without code."
argument-hint: "[cms]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Add CMS

Lets non-developers edit content safely while pages stay static and fast.

## Inputs

- `project.yaml → stack.cms`, `stack.frontend`, `i18n.locales`
- `docs/content/content-strategy.md` and `docs/content/sitemap.md` (page types)

## Phases

### Phase 1: Choose

If `stack.cms` is null, ask with trade-offs:
- `MDX in the repo`: free, versioned, developer-edited
- `Sanity`: hosted studio, real-time preview, GROQ
- `Payload`: self-hosted in your Next.js app and DB
- `Strapi`: self-hosted, REST/GraphQL
- `Contentful`: hosted, enterprise-friendly, pricier
ADR (template `adr`), then `config-set.sh stack.cms=<value>` after approval.

### Phase 2: Content model

`content-lead` + `cms-specialist` derive types from the sitemap: page, post,
author, category, landing section blocks, global settings (nav, footer). Each type
gets required SEO fields (title, description, OG image), slug rules, alt text on
images, and localisation fields if `i18n.locales` has more than one entry. Show the
model; ask for approval.

### Phase 3: Plan

`cms-specialist` with the frontend specialist:
- schema/config files in the repo
- typed client and generated types; queries fetching only needed fields
- static generation by default; on-demand revalidation via a **signed** webhook
  route that revalidates exactly the affected paths
- draft/preview mode behind auth, preview secret server-only
- image pipeline via the CMS CDN with explicit sizes
- redirects when slugs change; sitemap generated from content
- `.env.example` placeholders (project ID, dataset, read token, preview secret)
- tests: query mappers, the revalidation webhook (signature + paths), a Playwright check of a CMS-driven page with fixture content

Ask: stories (recommended) or direct implementation; then `/create-stories` or `/dev-story`.

## Never

Expose write or preview tokens to the client; hard-code editor-owned copy in components.

## Next step

`/seo-audit` once pages render from the CMS.
