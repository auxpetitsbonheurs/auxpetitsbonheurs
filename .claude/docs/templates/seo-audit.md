<!-- Template: seo-audit | Filled by: /seo-audit (seo-specialist) | Output: production/audits/seo-YYYY-MM-DD.md -->
# SEO Audit — [DATE]

Site: [URL] · Pages crawled: [N] · Verdict: [PASS | CONCERNS | FAIL]

## Technical
- [ ] Indexable pages return 200 and server-rendered content
- [ ] robots.txt correct; preview/staging blocked; app routes noindex
- [ ] XML sitemap lists all canonical indexable URLs, submitted: [yes/no — user action]
- [ ] Canonicals self-referencing and consistent (slash, case, params)
- [ ] No redirect chains; 301s for moved URLs; custom 404 returns 404
- [ ] hreflang correct (if multi-locale)
- [ ] HTTPS everywhere; no mixed content
- [ ] Core Web Vitals within budget (see perf audit)

## On-page
| URL | Title (≤60) | Description (≤155) | H1 | Canonical | OG image | Issues |
|---|---|---|---|---|---|---|
| / | [TITLE] | [DESC] | [H1] | [✓] | [✓] | [NONE] |

## Structured data
| Page type | Schema | Valid? | Notes |
|---|---|---|---|
| Home | Organization, WebSite | [✓] | |

## Content
- Keyword/intent coverage vs sitemap: [GAPS]
- Thin or duplicate pages: [LIST]
- Internal linking: [ORPHANS, OPPORTUNITIES]
- Images: alt text coverage [N%]

## Findings & fixes
| ID | Priority | Issue | Location | Fix |
|---|---|---|---|---|
