---
name: add-i18n
description: "Internationalises the app: picks an i18n library for the stack, adds locale routing and hreflang, extracts strings to ICU message catalogues, sets up Intl formatting, RTL support and a pseudo-locale check. Use when adding a second language or making the product translation-ready."
argument-hint: "[locale,...]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Add i18n

Makes every user-facing string translatable and every date, number and currency
locale-correct. Translations themselves are drafted only on request and flagged
for human review.

## Inputs

- `project.yaml → i18n.default_locale`, `i18n.locales`, `stack.frontend`, `stack.cms`
- Existing components and pages (Grep for JSX/template text nodes)

## Phases

### Phase 1: Locales and routing

Confirm the locales (argument or ask) and update `i18n.locales` via `config-set.sh`
after approval (write the list as `[en, de]`). Ask: URL strategy (`/de/...`
prefix (recommended), subdomain or domain per locale), and default-locale behaviour.

### Phase 2: Library

`i18n-specialist` picks by stack, e.g.: Next.js → `next-intl`; Nuxt → `@nuxtjs/i18n`;
SvelteKit → Paraglide; Astro → built-in i18n routing + a messages lib; Angular →
built-in i18n or Transloco; Remix → `remix-i18next`; Laravel/Django/Rails → the
framework's own. ADR if it's a new dependency.

### Phase 3: Plan

- message catalogues `messages/<locale>.json` (or the framework's format), ICU
  plurals/selects, type-safe keys
- string extraction plan per page/component (no string concatenation, no text in images)
- `Intl` formatting helpers for dates, numbers, currency, relative time; explicit time zones
- `hreflang` + localised metadata with `seo-specialist`; sitemap per locale
- RTL: `dir` attribute, logical CSS properties, mirrored directional icons
- CMS localisation fields if a CMS is used
- pseudo-locale (`en-XA`) for catching hard-coded strings and truncation
- tests: missing-key check in CI, Playwright run in a second locale

Ask: stories per area (recommended) or direct implementation.

## Never

Machine-translate legal or marketing copy without marking it for human review;
detect locale in a way that traps users (always offer a switcher).

## Next step

`/seo-audit` to verify hreflang and localised metadata.
