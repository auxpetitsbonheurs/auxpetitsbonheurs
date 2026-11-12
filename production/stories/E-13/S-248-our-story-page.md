# S-248: Our story page
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md#content-pages-fr-010 (About becomes Our story) · Design: brand-guide.md v0.3 (voice, imagery)
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, copywriter

## Story
As a customer, I want to read the story of the bakery, so that I know who bakes my cake and trust them.

## Acceptance Criteria
- [x] AC1 (FR-078): Given the stored page, when `/our-story` (and `/fr/our-story`) loads, then it shows one `h1` "Our story"/"Notre histoire", the intro, the body as paragraphs, and the photos (up to 4) with alt text in the locale, all from the page read (S-245).
- [x] AC2 (FR-078, NFR-007): Given a missing FR field, then the EN text shows for that field; a present FR text shows in FR; `lang` is correct on the page.
- [x] AC3 (FR-078): Given no photos, then no empty image area shows; given only an intro, then no empty body block shows.
- [x] AC4 (FR-078, NFR-003): Given text with HTML, then it shows escaped as plain text with line breaks and paragraphs.
- [x] AC5 (FR-078): Given placeholder content, then the page shows neutral sample text with no fake facts; given the page read fails, then a page error state with Retry and a WhatsApp link shows.
- [x] AC6 (FR-078): Given the end of the page, then a "Browse our collection"/"Voir notre collection" link to `/menu` is shown (one clear next step).
- [x] AC7 (FR-078): Given the old URL `/about` (and `/fr/about`), then it answers 301 to `/our-story` (same locale).
- [x] AC8 (FR-078, NFR-001, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then text measure is readable (max about 70 characters), photos have explicit dimensions and lazy-load below the fold, LCP <= 2.5 s, CLS <= 0.1, no horizontal scroll, contrast AA, one `h1`.

## Tests
- AC1 → src/app/routes/site/our-story.test.tsx
- AC2 → src/app/routes/site/our-story.test.tsx
- AC3 → src/app/routes/site/our-story.test.tsx
- AC4 → src/app/routes/site/our-story.test.tsx
- AC5 → src/app/routes/site/our-story.test.tsx
- AC6 → src/app/routes/site/our-story.test.tsx
- AC7 → src/app/routes/site/our-story.test.ts
- AC8 → src/tests/e2e/content-pages.spec.ts

## Notes
- Replaces the About half of E-04 S-070 (FAQ and policies stay there). Shared page component `SitePageView` is created here and reused by S-249, S-250 and S-252.
- Depends on: S-245, S-242/S-243 for the nav item.

## Build notes (2026-11-12, review)
- `SitePageView` (`app/components/site/site-page-view.tsx`) is shared by S-249 and S-250 (and S-252 later). AC7 is `site/about-redirect`.
- Tests as built: AC1-AC7 → `src/app/routes/site/our-story.test.tsx`; AC8 → `src/tests/e2e/content-pages.spec.ts` (320, 375, 1280, 200% zoom, keyboard, axe light and dark, measure check).
- AC8 caveat: LCP and CLS were not measured with Lighthouse here (route JS 156.9 kB gz; photos carry explicit sizes and lazy-load); S-254 runs the performance sweep.
