# S-065: Product page: photos, description, allergens, sold-out and unavailable states
Status: review
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#product-page-fr-007-fr-008
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist

## Story
As a customer, I want a product page with photos, description and allergen information, and a clear message when an item is sold out or gone, so that I can judge a cake and never try to order something unavailable.

## Acceptance Criteria
- [x] AC1 (FR-007): Given a product with 4 photos, when `/menu/:slug` loads, then the carousel shows "Photo 1 of 4" with previous/next buttons (a non-swipe alternative), photos have explicit width/height, and alt text equals the product name in the page locale.
- [x] AC2 (FR-007): Given allergen tags, when the page renders, then the tags and the fixed note that the kitchen handles all allergens both show.
- [x] AC3 (FR-007, FR-013): Given a product with its own notice of 5 days, when the page renders, then "Earliest date: {date}" shows today + 5 in Mauritius time, excluding closed days (this product only, not the basket).
- [ ] AC4 (FR-007): Given a sold-out product, when the page loads, then "Sold out this week" and a WhatsApp button show, options and the add bar are hidden, and the status field is `sold_out`.
- [x] AC5 (FR-007, FR-006): Given a hidden product or a seasonal product outside its window, when `/menu/:slug` is requested, then 404 shows "This product is no longer available" with a link to the menu; seasonal on D = 200, on D+1 = 404 (fixed clock, Mauritius date).
- [x] AC6 (FR-007): Given an unknown slug, when requested, then 404 with link to Home and WhatsApp.
- [x] AC7 (FR-007): Given a missing or failed photo, when the page renders, then a named placeholder of the same size shows (CLS <= 0.1).
- [x] AC8 (FR-007, NFR-007): Given locale fr and FR description null, when rendered, then the EN description shows.
- [x] AC9 (NFR-002, NFR-006): Given the page at 320 px and 375 px, at 200% zoom and keyboard-only, when the carousel is used (arrows keys and buttons, `prefers-reduced-motion` respected), then all controls are labelled with distinct names ("Previous photo", "Next photo"), >= 44 px, AA contrast per `docs/design/tokens.json`, no sideways scroll; swipe is never the only way.
- [x] AC10 (NFR-001): Given the product page JS, when measured, then the carousel is lazy-loaded and initial route JS <= 170 kB gz.

## Tests
- AC1 → src/app/routes/site/product-content.test.tsx, src/tests/e2e/browse-product.spec.ts
- AC2 → src/app/routes/site/product-content.test.tsx, src/tests/e2e/browse-product.spec.ts
- AC3 → src/app/routes/site/product-content.test.tsx (loader, fixed clock); rules tested in src/app/domain/availability.test.ts (E-05)
- AC4 → (job 1, options/price/add area; see Build notes)
- AC5 → src/app/routes/site/product-content.test.tsx (fixed clock, D vs D+1 Mauritius), src/tests/e2e/browse-product.spec.ts
- AC6 → src/app/routes/site/product-content.test.tsx
- AC7 → src/app/routes/site/product-content.test.tsx
- AC8 → src/app/routes/site/product-content.test.tsx
- AC9 → src/tests/e2e/browse-product.spec.ts
- AC10 → `npm run check:js-budget` (perf-budgets.spec.ts is S-072)

## Notes
- Contract: `site/product` loader (promotion and status fields resolved 2026-11-10).
- Hidden products are never serialised to the client (spec security note); covered in AC5 by asserting 404 body has no product data.
- Depends on E-01, E-03.

## Build notes (Sprint 4, 2026-11-13)
- Scope kept to product content (Sprint 4 job split): photos, description (plain text paragraphs), allergens + kitchen note, earliest date, seasonal note, and the 404 states. The options, price and Add-to-basket area belong to job 1 and were not touched.
- AC4 open: "Sold out this week" with a WhatsApp button lives in the ordering area (job 1). The loader still answers `status: "sold_out"` and the current sold-out note shows.
- Photos: one at a time in a box sized from the first photo, "Photo n of N" (polite live region), "Previous photo"/"Next photo" 44 px buttons, ArrowLeft/ArrowRight while focus is in the carousel, swipe as an extra; instant swap (nothing animates). The first photo is `fetchpriority=high`. A missing or failed photo (also a failure before hydration) becomes a named placeholder in the same box.
- AC10 caveat: the carousel is a ~1 kB component in the route chunk rather than a lazy chunk; the route is 163.8 kB gz initial JS (limit 170; job 1 adds the options picker to the same route).
- Earliest date: `earliestDate` from `domain/availability` (E-05 S-083), the date picker's own rules for this product alone: its notice (else the Settings default), its season, closed weekdays, blocked dates and the 90-day horizon; none shows when no day is open. Checkout still decides the order's real date (the basket may push it later).
- Allergen tags are the diet tags stored on products (eggless, nut-free, gluten-free, dairy-free); the kitchen note always shows.
- 404: hidden or seasonal out of window answers "This product is no longer available" with a link to the collection (no product data in the body); an unknown slug keeps the site 404 with Home; both offer WhatsApp when Settings has a number.
