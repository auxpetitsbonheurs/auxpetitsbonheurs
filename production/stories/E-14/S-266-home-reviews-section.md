# S-266: Reviews section on Home
Status: review
Epic: E-14-customer-reviews
Spec: docs/specs/features/catalogue-browsing.md (Home, FR-004; add reviews block) · Home story: E-04 S-063
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, ui-engineer

## Story
As a visitor, I want to see what other customers say about the bakery on the home page, so that I trust it before I order.

## Acceptance Criteria
- [ ] AC1 (FR-085): Given 1 or more approved reviews, when Home loads, then a section with `h2` "What our customers say"/"Ce que disent nos clients" shows the average rating (e.g. "4.5 out of 5", from 2 reviews, as text and stars with `aria-hidden` icons) and the latest 3 approved reviews (stars as text "5 of 5", comment, "Anna K.", date in the locale).
- [ ] AC2 (FR-085): Given 0 approved reviews, then the whole section is omitted (no empty heading or box) and Home layout does not jump (CLS <= 0.1).
- [ ] AC3 (FR-085): Given a long comment, then Home shows the first 160 characters with "Read more" linking to `/reviews`; text is plain, escaped.
- [ ] AC4 (FR-085): Given the section, then it has a "See all reviews"/"Voir tous les avis" link to `/reviews` and a "Write a review"/"Écrire un avis" link to `/reviews/write`; the section is not in the main navigation.
- [ ] AC5 (FR-085): Given a pending, rejected or hidden review, then it never appears in the section; given the review read fails, then the section is silently omitted and the rest of Home renders (no error box on Home).
- [ ] AC6 (FR-085): Given a review written in French shown on the English page, then it is shown as written with `lang="fr"` on that fragment (and the reverse).
- [ ] AC7 (FR-085, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then no horizontal scroll, reviews stack on phones, links >= 44 px with distinct names, AA contrast, no auto-rotating carousel, one `h1` on the page.
- [ ] AC8 (FR-085, NFR-001): Given Home on throttled 4G, then LCP <= 2.5 s and route JS <= 170 kB gz with the section in the server-rendered HTML.

## Tests
- AC1 → src/app/routes/home.test.tsx
- AC2 → src/app/routes/home.test.tsx, src/tests/e2e/reviews.spec.ts
- AC3 → src/app/components/site/review-card.test.tsx
- AC4 → src/app/routes/home.test.tsx
- AC5 → src/app/routes/home.test.tsx
- AC6 → src/app/components/site/review-card.test.tsx
- AC7 → src/tests/e2e/reviews.spec.ts
- AC8 → src/tests/e2e/perf-budgets.spec.ts

## Notes
- The `ReviewCard` and `StarRating` display components are created here and reused by S-267.
- Depends on: S-261, S-063 (Home), S-267 for the link target.

## Build notes (2026-11-13)
- Server-rendered from the 60 s isolate cache, read in parallel with the rest of Home; the section is omitted with none approved or on a failed read. Home keeps its deferred hydration; the section adds no client code beyond its markup.
- AC8: route JS checked with `npm run check:js-budget`; the LCP measurement on throttled 4G is left to the perf-budgets run on staging (S-269 AC5).
- Tests: src/app/routes/site/reviews.test.ts, src/app/domain/review.test.ts (excerpt), src/tests/e2e/reviews.spec.ts.
