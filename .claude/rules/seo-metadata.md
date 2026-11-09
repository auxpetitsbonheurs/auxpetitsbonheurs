---
paths:
  - "**/layout.*"
  - "**/head.*"
  - "**/+layout.*"
  - "**/sitemap.*"
  - "**/robots.*"
  - "**/seo/**"
  - "**/metadata.*"
  - "**/*.astro"
---

# SEO Metadata Rules

- Every indexable page: unique `<title>` (≤ 60 chars), meta description (≤ 160), canonical URL, Open Graph + Twitter card with a real image
- Authenticated, preview, search-result and thin pages are `noindex`
- Sitemap lists only canonical, indexable URLs; robots.txt points to it and never blocks CSS/JS needed to render
- Structured data (JSON-LD) matches visible content and validates
- Changed URLs get 301 redirects; no chains
- Content that should rank is server-rendered
