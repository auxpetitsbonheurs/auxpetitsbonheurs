# S-244: Our collection page grouped by type
Status: review
Epic: E-13-site-navigation-and-pages
Spec: docs/specs/features/catalogue-browsing.md#menu-rules-fr-005 (extend: grouped list) · ADR: docs/architecture/adr/0004-client-side-basket-and-cached-menu.md
Estimate: 5 pts
Owner: remix-specialist, tailwind-shadcn-specialist, ui-engineer

## Story
As a customer, I want to see all the bakery's cakes and sweets on one page, grouped by kind, so that I can pick one and start my order.

## Acceptance Criteria
- [x] AC1 (FR-077): Given available products, when `/menu` (and `/fr/menu`) loads, then it returns 200 (not 404) with an `h1` "Our collection"/"Notre collection" and one section per type that has products (`h2` per type, in the spec's type order), each with product cards in `sort_order`.
- [x] AC2 (FR-077): Given a product, then its card shows the first photo (explicit width/height, lazy below the fold, alt = product name in the locale), the name, "from Rs X" (lowest customer price) with `nowrap` price, and the whole card is one link to `/menu/:slug` (prefixed `/fr` in French).
- [x] AC3 (FR-077): Given a product with required options (size, box), then the card says "Choose options"/"Choisir les options" as its call to action and opens the product page where S-066 adds it to the basket; given a sold-out product, then the card shows a "Sold out"/"Épuisé" label (text plus icon) and still links to its page.
- [x] AC4 (FR-077): Given a hidden product, or a seasonal product outside its window by Mauritius date, then it is absent; given a type with no visible products, then its section is omitted (no empty heading).
- [x] AC5 (FR-077, NFR-001): Given the menu was cached (`apb_menu`), when I navigate to `/menu` within the app, then the page renders from the cache at once and revalidates in the background; given a cold first visit, the server-rendered page contains the full list (no loader spinner); content is read through the same code as `GET /api/menu`, never a second query path.
- [x] AC6 (FR-077): Given no products at all, then "Our collection is being prepared." with a WhatsApp link shows; given the menu cannot load, then a section error with Retry and WhatsApp shows (design-system Error state).
- [x] AC7 (FR-077, NFR-002, NFR-006): Given 320 px, 375 px, 200% zoom and keyboard only, then cards are in 2 columns at 375 px, 3 at md, 4 at lg; each card is one tab stop with a visible ring; long names wrap; a skip link or type anchors let keyboard users jump between types; no horizontal scroll; contrast AA per docs/design/tokens.json.
- [x] AC8 (FR-077, NFR-001): Given 20 products on throttled 4G, then LCP <= 2.5 s, CLS <= 0.1, route JS <= 170 kB gz, each image <= 300 kB.
- [x] AC9 (FR-077, FR-076): Given I am on `/menu/:slug`, then "Our collection" is the current nav item.

## Tests
- AC1 → src/app/routes/site/menu.test.ts, src/app/routes/site/menu.test.tsx
- AC2 → src/app/routes/site/menu.test.tsx
- AC3 → src/app/routes/site/menu.test.tsx
- AC4 → src/app/routes/site/menu.test.ts (fixed clock)
- AC5 → src/app/routes/site/menu.test.ts, src/tests/e2e/browse-menu.spec.ts (cached repeat visit)
- AC6 → src/app/routes/site/menu.test.tsx
- AC7 → src/tests/e2e/browse-menu.spec.ts
- AC8 → src/tests/e2e/perf-budgets.spec.ts
- AC9 → src/app/components/site/site-nav.test.tsx

## Notes
- Overlap with E-04 S-064 (grid with filters): this story creates the route and the grouped list; S-064 adds type/allergen filters and promotion pricing on top. product-director to confirm S-064 is rescoped, not duplicated.
- "Add-to-basket path" = product page for now because every real product has a required option group. A direct Add on cards without required options is an open question (E-13 Q7).
- Price: `fromPriceRs` from the pricing domain (S-081) or the same stub S-064 uses; do not compute prices in the card.
- Cookies are type `dessert` today (S-241); the visible group label for that type comes from the type list copy, copywriter may rename ("Cookies & desserts").
- Depends on: ADR-0004 `GET /api/menu`, S-041 type list, S-241 menu data.

## Build notes (2026-11-12)
- Built: `routes/site/menu.tsx` (loader = `loadMenu`, the `GET /api/menu` code; `clientLoader` from `apb_menu`), `app/domain/collection.ts` (`collectionSections`, `fromPriceRs`, `needsOptions`). `GET /api/menu` products now carry `season` (contracts v0.33) so out-of-season products are left out by Mauritius date.
- "from Rs X" = base price + the cheapest choice of each required pick-one/pick-several group (until S-081's pricing domain replaces it). Cards link to the product page only (E-13 lead decision 5): "Choose options" with a required group, "See details" otherwise.
- AC6: the empty and error states show WhatsApp when Settings has a number.
- AC7: 1 column below 20rem (200% zoom on a 320 px phone) so long names never clip; 2 on phones, 3 at md, 4 at lg.
- AC8 caveat: JS budget and lazy images checked (route 157.6 kB gz); LCP/CLS on throttled 4G with 20 products is not measured yet (no `perf-budgets.spec.ts`); S-254 runs the performance sweep.
- Tests: `app/domain/collection.test.ts`, `app/routes/site/menu.test.ts`, `app/routes/site/menu.test.tsx`, `tests/e2e/browse-menu.spec.ts` (src/ paths).
