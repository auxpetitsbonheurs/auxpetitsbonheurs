# S-011: Open the sample cake and add it to the basket
Status: review
Epic: E-01-walking-skeleton
Spec: docs/specs/features/checkout-and-tracking.md#basket-storage
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, tailwind-shadcn-specialist

## Story
As a customer, I want to open a cake and add it to my basket, so that I can start an order.

## Acceptance Criteria
- [x] AC1 (FR-018): Given the seeded sample product, when I open `/menu/chocolate-cake`, then I see its name and description in the page language, its base price as "Rs 850", its photo with alt text equal to the product name, and an "Add to basket" button.
- [x] AC2 (FR-005): Given an unknown slug or a product with status `hidden`, when I open it, then the response is 404 with the not-found page.
- [x] AC3 (FR-008): Given a product with status `sold_out`, when I open it, then it renders with a "Sold out" label and no Add button; given a forged POST `addToBasket`, then `PRODUCT_UNAVAILABLE` (409) and the basket is unchanged.
- [x] AC4 (FR-018): Given I press "Add to basket", then the `apb_basket` cookie (HttpOnly, SameSite=Lax) holds product id, quantity and no prices, I am redirected to `/basket`, and the header basket count shows 1.
- [x] AC5 (FR-018): Given the same product is added twice, then the existing line quantity becomes 2 (capped at 50); given 10 different lines exist, when an 11th is added, then `BASKET_FULL` (422) and the basket is unchanged.
- [x] AC6 (NFR-003): Given a tampered or unparseable `apb_basket` cookie, then lines that are invalid are dropped and valid ones kept, and an unparseable cookie is treated as an empty basket; the cookie stays under 4 kB.
- [x] AC7 (NFR-007): Given `/fr/menu/chocolate-cake` and a product with no French name, then the English name shows; with a French name, the French shows.
- [x] AC8 (NFR-002): Given the product page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [x] AC9 (NFR-002): Given light and dark mode, then every text and control pair meets WCAG AA contrast per docs/design/tokens.json, the image has explicit width and height (no layout shift), and an axe scan reports no serious or critical violations.

## Tests
- AC1 → src/app/routes/site/product.test.ts and src/tests/e2e/checkout.spec.ts
- AC2 → src/app/routes/site/product.test.ts and src/tests/e2e/checkout.spec.ts
- AC3 → src/app/routes/site/product.test.ts
- AC4 → src/app/server/basket.server.test.ts, src/app/routes/site/product.test.ts and src/tests/e2e/checkout.spec.ts (also without JavaScript)
- AC5 → src/app/server/basket.server.test.ts and src/app/routes/site/product.test.ts
- AC6 → src/app/server/basket.server.test.ts
- AC7 → src/app/routes/site/product.test.ts and src/tests/e2e/checkout.spec.ts
- AC8 → src/tests/e2e/checkout.spec.ts
- AC9 → src/tests/e2e/checkout.spec.ts

## Notes
- Depends on: S-004, S-006, S-007.
- Contract: `site/product` loader and `addToBasket` (contracts.md "Customer site"); the minimal slice has no option groups, notice date or promotion fields (E-04, E-05 widen the loader).
- Sample data: `npm run seed:sample` inserts product "Chocolate cake" (slug `chocolate-cake`, base Rs 850, one photo, status available); it refuses to run when `APP_ENV=production`. The price is sample data, not a launch price.
- Old slugs redirecting (301) are E-03 (S-050).
- Basket limits are shared constants (`BASKET_MAX_LINES = 10`, `LINE_MAX_QUANTITY = 50`) in `contracts/shared.ts`.
- Decision: the limits live in `app/domain/basket.ts` and are re-exported by `app/server/contracts/shared.ts`, because views may not import `app/server/**` (ESLint server boundary).
- Decision: the sample photo is a bundled static SVG (`/images/sample/chocolate-cake.svg`, 800x600); `lib/images.ts` passes paths starting with "/" through and maps Storage paths to the `public-images` CDN URL, so the skeleton needs no Storage upload.
- Decision: no sticky Add bar or WhatsApp button on sold-out yet (no options or live price in this slice); they come with the E-04 product layout.
- Decision: `apb_basket` is `Secure; HttpOnly; SameSite=Lax; Path=/`, 30 days; a cookie over 4000 bytes is refused as `BASKET_FULL`; a repeated `lineId` is dropped as invalid.
- `basket-count.server.ts` (provisional S-007 reader) is replaced by `basket.server.ts`; its tests moved there, and the shell/language e2e cookie fixtures now use the real line format.
- `npm run seed:sample` added (refuses `APP_ENV=production`); the e2e baseline seeds the same product and photo from `app/db/sample-data.ts`.
