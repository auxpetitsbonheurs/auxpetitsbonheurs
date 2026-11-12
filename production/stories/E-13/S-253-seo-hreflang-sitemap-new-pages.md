# S-253: Titles, descriptions, hreflang, share previews and sitemap for the new pages
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/content/sitemap.md · Story it extends: E-04 S-071
Estimate: 3 pts
Owner: seo-specialist, remix-specialist, copywriter

## Story
As the bakery, I want each page to have a proper title, description and language links, so that Google and social previews show the right thing in English and French.

## Acceptance Criteria
- [x] AC1 (FR-081; /menu, /contact, /custom-cake done, the other three follow when S-248..S-250 call `seoMeta`): Given each of `/menu`, `/our-story`, `/custom-cake`, `/workshops`, `/gallery`, `/contact` in EN and FR, then the head has a unique `<title>` ("Our story | Aux petits bonheurs"), a meta description of 50 to 160 characters in that language, and a canonical URL (no filters or `fromGallery` parameters).
- [x] AC2 (FR-081): Given each page, then `<link rel="alternate" hreflang="en|fr|x-default">` points to the matching EN and FR URLs (FR under `/fr`), reciprocally, and the language switch link carries the same `hreflang`.
- [x] AC3 (FR-081, NFR-010): Given each page, then Open Graph and Twitter tags carry the title, description and a share image (the page's first photo, else the brand image), absolute URLs.
- [x] AC4 (FR-081): Given `/sitemap.xml`, then it lists the six pages in both languages with `xhtml:link` alternates and no admin, basket, tracking or account URL.
- [x] AC5 (FR-081): Given a page whose `is_placeholder` is true (Our story, Workshops, Gallery intro, Contact, Custom order), then it carries `robots` noindex and is left out of the sitemap until the client edits it; `/menu` is never noindex.
- [x] AC6 (FR-081): Given `/about` 301 to `/our-story` (S-248), then the sitemap lists only `/our-story`.
- [x] AC7 (FR-081, NFR-010): Given the Contact page with real (non-placeholder) address and hours, then optional LocalBusiness JSON-LD is valid; given placeholders, then none is emitted. No AggregateRating is emitted here (see E-14).
- [x] AC8 (FR-081): Given titles and descriptions, then they come from the i18n catalogue (copywriter-owned, FR present) and a missing FR string fails the i18n check.

## Tests
- AC1 → src/app/routes/site/seo-pages.test.ts
- AC2 → src/app/routes/site/seo-pages.test.ts
- AC3 → src/app/routes/site/seo-pages.test.ts
- AC4 → src/app/routes/hooks/sitemap.test.ts
- AC5 → src/app/routes/site/seo-pages.test.ts
- AC6 → src/app/routes/hooks/sitemap.test.ts
- AC7 → src/app/routes/site/seo-pages.test.ts
- AC8 → src/app/i18n/i18n.test.ts (completeness), src/app/routes/site/seo-pages.test.ts

## Notes
- If S-071 is not built when this starts, build the shared head and sitemap helpers here and let S-071 reuse them (one implementation).
- The noindex-while-placeholder rule is a safeguard; E-12 S-222/S-224 verify it is gone at launch.
- Depends on: S-244 and S-248..S-252 (pages exist), S-245 (`is_placeholder`), S-071.

## Build notes (2026-11-12)
- Shared helpers (S-071 reuses them, one implementation):
  - `app/lib/seo.ts`: `seoMeta({ origin, locale, path, title, description, image?, noindex? })` returns title ("X | Aux petits bonheurs"), description, canonical (no query), `og:*` (type, site_name, locale, title, description, url, image = the page's first photo else the brand image with its size), `twitter:*`, and `robots: noindex` when asked. `rootOrigin(matches)` reads the origin from the root loader. A route using it exports `handle = SEO_HANDLE`, so the root Layout leaves out its own brand `og:image` (one share image per page); pages not yet on `seoMeta` keep the root's brand image. hreflang en/fr/x-default stay in the root Layout (from the URL, all customer pages).
  - `app/lib/sitemap.ts`: `sitemapXml(origin, paths)` with `xhtml:link` alternates.
  - `app/server/seo-pages.server.ts`: **the coordination seam for S-245..S-250.** `contentPagePlaceholders(db)` returns `{ our_story, custom_order, workshops, gallery, contact }: boolean` (true = still placeholder). It returns all true today. S-245 replaces its body with the `site_page.is_placeholder` read (missing row = true; Settings cache pattern). `sitemapPaths(db)` / `indexablePaths(flags)` build the sitemap from it, so an edited page joins the sitemap and loses noindex with no other change.
  - Routes: `GET /sitemap.xml` (`routes/hooks/sitemap.ts`) and `GET /robots.txt` (`routes/hooks/robots.ts`: `Disallow: /admin`, `Sitemap:` line).
- **How S-248..S-250 plug in:** in the page loader read `isPlaceholder` from the stored page (or `contentPagePlaceholders`), export `handle = SEO_HANDLE`, and in `meta` return `seoMeta({ origin: rootOrigin(matches), locale, path: "/our-story", title, description, image: firstPhotoUrl, noindex: isPlaceholder })`. Add the page's title/description keys to `PAGES` in `app/routes/site/seo-pages.test.ts` (50 to 160 characters, FR present) and the page to `PAGES` in `tests/e2e/content-pages.spec.ts`. Do not touch the sitemap route.
- Applied to: `/menu` (never noindex), `/contact`, `/custom-cake`, and Home (`/`).
- AC1 caveat: `/our-story`, `/workshops`, `/gallery` are still the batch A "coming soon" pages (title + noindex only) until S-248..S-250 call `seoMeta`. AC6: no `/about` route exists yet (its 301 is S-248's); the sitemap never lists it.
- AC7: `bakeryJsonLd` on Contact (see S-251 AC9); never with placeholders, no AggregateRating.
- AC8: titles/descriptions in `en.json`/`fr.json`; the existing completeness test fails on a missing FR string, and `seo-pages.test.ts` checks each page's FR description exists in `fr.json` itself.
- Product pages in the sitemap and product head tags remain S-071 (it calls the same helpers).
- Tests: `app/routes/site/seo-pages.test.ts`, `app/routes/hooks/sitemap.test.ts`, `app/routes/site/contact.test.ts`, `app/routes/site/custom-order.test.ts`, `tests/e2e/content-pages.spec.ts`.
- **Integrated with S-245..S-250 (2026-11-12):** `contentPagePlaceholders` reads `site_page.is_placeholder` (`getPagePlaceholders`, one query, 60 s per isolate, cleared by an admin save; a missing row or failed read counts as placeholder). `/our-story`, `/workshops`, `/gallery` use `seoMeta` through `brandPageMeta` (share image = the page's first photo) and export `SEO_HANDLE`; their keys are in `seo-pages.test.ts`; `sitemap.test.ts` checks a saved page joins. The brand pages' e2e is `tests/e2e/brand-pages.spec.ts` (their own file, so `content-pages.spec.ts` stays batch D's). `/about` now answers 301 to `/our-story` and is never in the sitemap. The coming-soon route is removed (every nav page is built).
