# S-267: Public Reviews page and footer link
Status: review
Epic: E-14-customer-reviews
Spec: docs/specs/features/catalogue-browsing.md (add Reviews) · Footer: E-04 S-061
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, seo-specialist

## Story
As a visitor, I want a page with all the approved reviews of the bakery, so that I can read them before ordering.

## Acceptance Criteria
- [ ] AC1 (FR-085): Given approved reviews, when `/reviews` (and `/fr/reviews`) loads, then it shows `h1` "Reviews"/"Avis", the average and count at the top, and the reviews newest first, each with stars (text "4 of 5"), comment (plain text, line breaks kept), first name and last initial, and the date.
- [ ] AC2 (FR-085): Given more than 10 reviews, then the first 10 show and a "Show more" button loads the next (no numbered pagination), with no layout shift.
- [ ] AC3 (FR-085): Given no approved reviews, then "No reviews yet. Be the first." with a "Write a review" button to `/reviews/write` shows; given the read fails, then an error state with Retry shows.
- [ ] AC4 (FR-085): Given the page, then a "Write a review" button (or "Edit my review" if I have one) is shown; if I am not signed in it leads to the sign-in prompt of S-262.
- [ ] AC5 (FR-085): Given the footer on every customer page, then it has a "Reviews"/"Avis" link to `/reviews` next to FAQ and policies (footer only; the 7-item navigation is unchanged); the Reviews link is omitted when there are 0 approved reviews and the page is not indexed.
- [ ] AC6 (FR-085, FR-081): Given the page, then it has a unique title and description in EN and FR, canonical and hreflang alternates, share preview, a sitemap entry when it has at least one approved review, and no AggregateRating or Review structured data (policy; PRD question 18).
- [ ] AC7 (FR-085, NFR-003): Given a review whose comment contains HTML, then it shows escaped; given hidden, pending or rejected reviews, then none show and none appear in the page's data payload.
- [ ] AC8 (FR-085, NFR-002, NFR-006, NFR-001): Given 320 px, 375 px, 200% zoom and keyboard only, then no horizontal scroll, buttons >= 44 px, AA contrast, one `h1`, LCP <= 2.5 s, CLS <= 0.1, route JS <= 170 kB gz.

## Tests
- AC1 → src/app/routes/site/reviews.test.tsx
- AC2 → src/app/routes/site/reviews.test.tsx
- AC3 → src/app/routes/site/reviews.test.tsx
- AC4 → src/app/routes/site/reviews.test.tsx
- AC5 → src/app/components/site/footer.test.tsx
- AC6 → src/app/routes/site/seo-pages.test.ts, src/app/routes/hooks/sitemap.test.ts
- AC7 → src/app/routes/site/reviews.test.tsx
- AC8 → src/tests/e2e/reviews.spec.ts, src/tests/e2e/perf-budgets.spec.ts

## Notes
- Depends on: S-261, S-266 (`ReviewCard`), S-061 (footer), S-253 (sitemap and head helpers).
- Do not use AggregateRating unless policy-safe is confirmed (a business's own reviews of itself are not eligible for star results under search-engine review guidelines; re-check at build).

## Build notes (2026-11-13)
- AC2: "Show more" is a plain link to `?shown=20` (works before JavaScript; content appends below, so nothing above moves). /reviews joins the deferred-hydration browsing pages.
- Tests: src/app/routes/site/reviews.test.ts, src/tests/e2e/reviews.spec.ts.
