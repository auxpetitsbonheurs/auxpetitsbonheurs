# S-050: Renamed product links keep working
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#api-contract
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, api-engineer

## Story
As a customer with an old link or a bookmark, I want it to take me to the renamed product, so that I never land on a dead page.

## Acceptance Criteria
- [x] AC1 (FR-062): Given a product whose slug changes from `a` to `b`, when saved, then the old slug `a` is stored in `product_slug_history` in the same transaction.
- [x] AC2 (FR-062): Given `/menu/a` after the rename, then the response is a 301 to `/menu/b`; the current slug is looked up first and the history only if that fails; `/fr/menu/a` redirects to `/fr/menu/b`.
- [x] AC3 (FR-062): Given two renames `a` to `b` to `c`, then both `/menu/a` and `/menu/b` answer 301 to `/menu/c`.
- [x] AC4 (FR-062): Given the target product is hidden or out of season, then the redirect target answers 404 as usual (rules apply at the target); given the product was deleted, then the old slug answers 404.
- [x] AC5 (FR-062): Given a slug that belongs to another product or appears in anyone's history, when another product tries to use it, then `409` with `fields.slug` and nothing is saved.
- [x] AC6 (FR-062): Given a product returns to a previous slug, then that slug's history row is removed and `/menu/<slug>` serves it directly (no redirect loop).
- [x] AC7 (FR-062): Given a slug with capital letters, spaces or a length over 80, then `VALIDATION_FAILED` on `slug`.
- [x] AC8 (NFR-010): Given a redirect, then the `Location` header is a relative path on the same site, never an absolute URL from user input.

## Tests
- AC1 → src/app/server/services/save-product.server.test.ts (Postgres container)
- AC2 → src/app/routes/site/product.test.ts
- AC3 → src/app/routes/site/product.test.ts
- AC4 → src/app/routes/site/product.test.ts
- AC5 → src/app/server/services/save-product.server.test.ts
- AC6 → src/app/server/services/save-product.server.test.ts and src/app/routes/site/product.test.ts
- AC7 → src/app/server/services/save-product.server.test.ts
- AC8 → src/app/routes/site/product.test.ts

## Notes
- Depends on: S-004 (the `product_slug_history` table, E-01 carry-over concern 1), S-011 (E-01 product loader), S-046.
- Owner decision Q19 (2026-11-10): old URL redirects with 301. Contract: `site/product` loader and `admin/product` `save` (contracts v0.4).
- The slug field is editable in the editor with a warning "Changing the link breaks nothing: the old link will forward" (copy by `copywriter`).
- No UI beyond S-046's slug field, so no extra accessibility criteria apply beyond that story's.

## Build notes (2026-11-12, batch 4)
- Save side (AC1, AC5-AC7) was already in `save-product.server.ts` from S-046; S-050 adds its tests and the `site/product` 301 (`findRenamedSlug`, looked up only after the current slug misses). Location is `localePath(locale, /menu/<stored slug>)`, never from the request.
- AC4 caveat: "out of season" answers whatever the target page does; today the public product page does not 404 out-of-season products (S-049 judges the season on the pickup date), so only hidden is 404 at the target.
- Editor slug hint now says the old link will forward (EN/FR).
