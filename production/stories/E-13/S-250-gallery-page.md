# S-250: Gallery page
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md (Gallery row) · Admin photos: E-03 S-054, S-055
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, accessibility-specialist

## Story
As a customer, I want to see photos of the bakery's cakes, so that I get ideas and see the quality.

## Acceptance Criteria
- [x] AC1 (FR-078, FR-009): Given gallery photos, when `/gallery` (and `/fr/gallery`) loads, then it shows `h1` "Gallery"/"Galerie", the editable intro (EN fallback per field) and a grid of photos in the admin's order, 2 columns at 375 px and 3 from `md`, each with explicit width/height, blur or colour placeholder, lazy below the fold, alt text from its caption (locale) or occasion.
- [x] AC2 (FR-078): Given no photos yet, then "Photos coming soon."/"Photos bientôt disponibles." with a link to Our collection and a WhatsApp link shows, never a blank grid; given the read fails, then a section error with Retry shows.
- [x] AC3 (FR-078, NFR-001): Given more than 24 photos, then the first 24 show and a "Show more" button loads the rest (design-system pagination), with no layout shift; LCP <= 2.5 s, CLS <= 0.1, route JS <= 170 kB gz, images <= 300 kB.
- [x] AC4 (FR-078): Given a photo, then it is not yet a lightbox (E-04 S-069 adds that with occasion filter and "Request something similar"); it is a plain image with its caption below when present.
- [x] AC5 (FR-078, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then no horizontal scroll, the Show more button is >= 44 px, captions are real text, contrast AA, one `h1`, nothing depends on swipe or hover.
- [x] AC6 (FR-078): Given a photo is deleted in admin, then it is gone from the page within 60 s.

## Tests
- AC1 → src/app/routes/site/gallery.test.tsx
- AC2 → src/app/routes/site/gallery.test.tsx
- AC3 → src/app/routes/site/gallery.test.tsx, src/tests/e2e/perf-budgets.spec.ts
- AC4 → src/app/routes/site/gallery.test.tsx
- AC5 → src/tests/e2e/content-pages.spec.ts
- AC6 → src/app/routes/site/gallery.test.ts

## Notes
- Photos come from the gallery table managed by S-054/S-055 (stretch in sprint 02; recommend pulling both in ahead of this story, otherwise the page ships with its empty state). The intro text is a Pages field (S-246).
- S-069 (E-04) extends this route with occasion filter, lightbox and the request link; keep one route file.
- Depends on: S-245, S-248, S-054.

## Build notes (2026-11-12, review)
- Ships with its empty state (S-054/S-055 not pulled forward, Lead decision 7). "Show more photos" is a link to `?more=1` (works without JavaScript, keeps the scroll position); the placeholder is the brand's decorative colour behind each sized image.
- Tests as built: AC1-AC4, AC6 → `src/app/routes/site/gallery.test.tsx`; AC5 → `src/tests/e2e/content-pages.spec.ts`.
- AC3 caveat: LCP/CLS not measured with Lighthouse here (route JS 157.6 kB gz); covered by the S-254 sweep.
