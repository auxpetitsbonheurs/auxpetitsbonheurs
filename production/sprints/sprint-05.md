# Sprint 05: Offers and fast photos

Planned 2026-11-13.

**Goal:** the Owner's offers run on their own (start and end on time, lowest price, a calm banner) and customers see them on cards, the product page and the basket; product photos load at the right size; the basket page is back under its JS budget with room to grow.

**Way of working (Owner rule, 2026-11-13):** jobs run in parallel; each pushes to main as soon as it is done and its own fast checks pass (lint, typecheck, unit suite, build, JS budget, client-secret check, gitleaks, affected Playwright specs). CI runs the full suites.

| Job | Stories | Pts |
|---|---|---|
| Promotions | S-082 promotions (live window, best price, no stacking), S-062 promo banner, plus S-066 AC4 (offer on the product page) and S-092 AC3 (`promotion_id` on order items) | 6 |
| Responsive photos | S-276 responsive product photos (srcset, photo variants; migration 0011) | — |
| Bundle trim | basket route JS trim (basket-en was 169.96/170 kB) | — |
| Promotions admin (added) | S-052 promotions list, S-053 promotion editor (without its image, AC8) | 8 |

**Next candidates:** S-085, S-086, S-089 to S-091, S-093 to S-098.

## Daily log
- 2026-11-13: planned; the three jobs started in parallel.
- 2026-11-13 (promotions): `domain/promotions.ts` (T-PM-1..16, property tests), migration 0012 (`product_promotion`; `place_order` prices the sale base and stores `promotion_id`, title and sale base; 0009/0010 rules kept), SQL and TS tested to agree. Menu carries live promotions (browser drops one on its end instant), product page (struck price, "Offer ends"), home and menu cards, basket line; banner in the customer layout with Dismiss (session cookie, works without JavaScript). Contracts v0.39 (v0.38 went to S-276).  Affected e2e green (320 passed, 5 skipped). No admin screen yet: promotions are added in the database until S-052/S-053.
- 2026-11-13 (promotions, landed): rebased onto main after S-276 deferred hydration. The earlier "ordering area hydrates with the page" fix was dropped (it awaited the chunk and undid the deferral); main's mount-time adopt step covers the gap, now with an e2e test that holds only the ordering area's chunk after the page hydrated. Promotions pushed (migration 0012, contracts v0.39). Unit suite 2676 green; affected e2e 303 passed.
- 2026-11-13 (promotions admin): `/admin/promotions` (status badges, Turn off/on, Delete; a Live one must be ended first) and `/admin/promotions/new|:id` (titles and texts EN/FR, Mauritius start/end, placement, link, offer per product with the resulting price and the "lowest price applies" note), linked from More. Not built: the promotion image (S-053 AC8); Home promo cards show their title and text without a photo meanwhile.
