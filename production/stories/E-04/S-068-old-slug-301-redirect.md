# S-068: Old product links redirect to the renamed product
Status: ready
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#edge-cases
Estimate: 2 pts
Owner: remix-specialist, postgres-specialist

## Story
As a customer holding an old or shared link to a product that was renamed, I want the link to still open the product, so that I do not land on an error page.

## Acceptance Criteria
- [ ] AC1 (FR-007): Given product P was renamed and its old slug is in `product_slug_history`, when `/menu/<old-slug>` (and `/fr/menu/<old-slug>`) is requested, then the response is `301` to the current `/menu/<slug>` (same locale prefix, query string kept).
- [ ] AC2 (FR-007): Given a slug that matches both the current slug of one product and an old slug, when requested, then the current slug wins (history is checked only after the current lookup fails).
- [ ] AC3 (FR-007): Given an old slug whose product is now hidden or out of season, when requested, then it redirects 301 and the target answers 404 per the product rules.
- [ ] AC4 (FR-007): Given a slug with uppercase letters or a trailing slash, when requested, then `301` to the canonical lower-case slug without trailing slash.
- [ ] AC5 (FR-007): Given an unknown slug in neither table, when requested, then 404 (not a redirect).
- [ ] AC6 (FR-007): Given a product returns to a previous slug, when that old slug is requested, then no redirect loop occurs (history row removed by the editor, current slug served directly).
- [ ] AC7 (NFR-010): Given a redirected request, when crawled, then the redirect is permanent (301, not 302) and the canonical tag on the target uses the current slug.

## Tests
- AC1 → src/app/routes/site/product.test.ts
- AC2 → src/app/routes/site/product.test.ts
- AC3 → src/app/routes/site/product.test.ts
- AC4 → src/app/routes/site/product.test.ts
- AC5 → src/app/routes/site/product.test.ts
- AC6 → src/app/routes/site/product.test.ts
- AC7 → src/tests/e2e/browse-product.spec.ts

## Notes
- Owner decision Q19. Needs the `product_slug_history` table (Drizzle `src/app/db/tables/catalogue.ts`, expand-only migration); E-01 migration 0000 may already include it: if not, this story adds it (postgres-specialist). Writing history on rename belongs to E-03 product editor (FR-062).
- No UI, so no a11y ACs.
