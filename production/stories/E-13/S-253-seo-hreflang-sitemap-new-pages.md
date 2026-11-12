# S-253: Titles, descriptions, hreflang, share previews and sitemap for the new pages
Status: ready
Epic: E-13-site-navigation-and-pages
Spec: docs/content/sitemap.md · Story it extends: E-04 S-071
Estimate: 3 pts
Owner: seo-specialist, remix-specialist, copywriter

## Story
As the bakery, I want each page to have a proper title, description and language links, so that Google and social previews show the right thing in English and French.

## Acceptance Criteria
- [ ] AC1 (FR-081): Given each of `/menu`, `/our-story`, `/custom-cake`, `/workshops`, `/gallery`, `/contact` in EN and FR, then the head has a unique `<title>` ("Our story | Aux petits bonheurs"), a meta description of 50 to 160 characters in that language, and a canonical URL (no filters or `fromGallery` parameters).
- [ ] AC2 (FR-081): Given each page, then `<link rel="alternate" hreflang="en|fr|x-default">` points to the matching EN and FR URLs (FR under `/fr`), reciprocally, and the language switch link carries the same `hreflang`.
- [ ] AC3 (FR-081, NFR-010): Given each page, then Open Graph and Twitter tags carry the title, description and a share image (the page's first photo, else the brand image), absolute URLs.
- [ ] AC4 (FR-081): Given `/sitemap.xml`, then it lists the six pages in both languages with `xhtml:link` alternates and no admin, basket, tracking or account URL.
- [ ] AC5 (FR-081): Given a page whose `is_placeholder` is true (Our story, Workshops, Gallery intro, Contact, Custom order), then it carries `robots` noindex and is left out of the sitemap until the client edits it; `/menu` is never noindex.
- [ ] AC6 (FR-081): Given `/about` 301 to `/our-story` (S-248), then the sitemap lists only `/our-story`.
- [ ] AC7 (FR-081, NFR-010): Given the Contact page with real (non-placeholder) address and hours, then optional LocalBusiness JSON-LD is valid; given placeholders, then none is emitted. No AggregateRating is emitted here (see E-14).
- [ ] AC8 (FR-081): Given titles and descriptions, then they come from the i18n catalogue (copywriter-owned, FR present) and a missing FR string fails the i18n check.

## Tests
- AC1 → src/app/routes/site/seo-pages.test.ts
- AC2 → src/app/routes/site/seo-pages.test.ts
- AC3 → src/app/routes/site/seo-pages.test.ts
- AC4 → src/app/routes/hooks/sitemap.test.ts
- AC5 → src/app/routes/site/seo-pages.test.ts
- AC6 → src/app/routes/hooks/sitemap.test.ts
- AC7 → src/app/routes/site/seo-pages.test.ts
- AC8 → src/app/i18n/catalogue.test.ts

## Notes
- If S-071 is not built when this starts, build the shared head and sitemap helpers here and let S-071 reuse them (one implementation).
- The noindex-while-placeholder rule is a safeguard; E-12 S-222/S-224 verify it is gone at launch.
- Depends on: S-244 and S-248..S-252 (pages exist), S-245 (`is_placeholder`), S-071.
