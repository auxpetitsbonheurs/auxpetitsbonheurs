---
name: seo-audit
description: "Technical and on-page SEO audit by seo-specialist: crawlability, rendering, status codes, titles and descriptions, canonicals, sitemap and robots, structured data, hreflang, internal links and Core Web Vitals. Use before launch, after URL or content changes, during a site migration, or when rankings drop."
argument-hint: "[url | 'local']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(curl -s*), Bash(npx playwright*), Bash(npx lighthouse*)
model: sonnet
---

# SEO Audit

Checks that every page that should rank can be crawled, rendered and
understood, and that nothing that should stay private gets indexed. Writes
`production/audits/seo-YYYY-MM-DD.md`. It never submits sitemaps, changes
Search Console or edits code without approval.

## Inputs

- `docs/content/sitemap.md` and `docs/content/content-strategy.md` (target keywords per page)
- `project.yaml`: `project.type`, `i18n.locales`, `i18n.default_locale`, `budgets.lighthouse.seo`
- Argument: a preview/production URL, or `local` (production build)

API-only projects (`project.type: api`): say SEO does not apply beyond the docs
site, if any, and stop.

## Phases

### Phase 1: Collect URLs

Merge URLs from `/sitemap.xml` (fetch it), the sitemap doc, and a shallow crawl
of internal links from the home page (depth 2, max ~100 URLs, same origin
only, honour `robots.txt`). Mark each as **indexable** (marketing, content,
product pages) or **private** (app, auth, account, checkout, admin, previews).

### Phase 2: Per-URL checks

For each URL (`curl -s -o /dev/null -w '%{http_code} %{redirect_url}'` and the
rendered HTML via Playwright when content is client-rendered):
- Status 200 for indexable pages; 301 (not 302) for moved pages; no redirect chains; 404s return 404, not a soft 200.
- Main content present in the server HTML (not only after JS).
- `<title>` 30–60 chars and unique; meta description 70–160 chars and unique; one `h1`.
- `<link rel="canonical">` absolute and self-referencing (or pointing to the true canonical); trailing slash and case policy consistent.
- `robots` meta: private pages `noindex`; indexable pages not accidentally `noindex`.
- Open Graph and Twitter tags with a 1200×630 image that loads.
- Images: `alt` present and descriptive; lazy-loading not on the LCP image.
- `hreflang` for every locale plus `x-default` when `i18n.locales` has more than one, reciprocal across versions.

### Phase 3: Site-level checks

- `robots.txt`: exists, does not block CSS/JS or indexable sections, references the sitemap; preview/staging hosts disallowed or protected.
- `sitemap.xml`: valid, only canonical 200 indexable URLs, `lastmod` real.
- Structured data (JSON-LD): Organization + WebSite on home; Product/Offer, Article, BreadcrumbList, FAQPage, SoftwareApplication as relevant. Validate syntax and required properties.
- Internal linking: orphan pages, key pages more than 3 clicks deep, broken links.
- Core Web Vitals: reuse the latest `/perf-audit` or run Lighthouse SEO + performance on the top 3 templates.

### Phase 4: Content fit

Spawn `seo-specialist` with the content strategy: does each key page target one
intent, with the keyword in title, `h1` and early copy, without stuffing?
Flag duplicate or thin pages and cannibalisation.

### Phase 5: Report

Use the `seo-audit` template: summary, URL table (status, indexable, title,
canonical, issues), findings ranked **Critical** (indexable pages blocked or
private pages indexed) → **High** → **Medium** → **Low**, each with URL,
file:line where the metadata is set, and the fix. Ask before writing.

### Phase 6: Follow-up

Offer stories for fixes, and for a migration a 301 redirect map in the report.

## Output

`production/audits/seo-YYYY-MM-DD.md` (template: `.claude/docs/templates/seo-audit.md`).

## Rigor

- `minimal`: site-level checks + home and top 3 pages.
- `standard`: all indexable URLs + structured data.
- `full`: adds content fit, hreflang matrix and CWV per template.

## Next step

`/content-calendar` for content gaps, or `/launch-checklist`.
