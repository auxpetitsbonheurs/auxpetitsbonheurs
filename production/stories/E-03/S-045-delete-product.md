# S-045: Delete a product safely
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#acceptance-criteria
Estimate: 2 pts
Owner: remix-specialist, postgres-specialist, ui-engineer

## Story
As a bakery admin, I want to delete a product I no longer sell, so that the menu stays tidy, without damaging past orders.

## Acceptance Criteria
- [x] AC1 (FR-061): Given a product present in past orders, when I confirm Delete, then the product is removed and those orders still show its name, options and prices (order items keep their snapshot, product link set to null).
- [x] AC2 (FR-061): Given the confirm dialog, then it names the product, recommends "Hide instead" with a button for it, and Delete needs a second explicit press.
- [x] AC3 (FR-061): Given a product on a live promotion or with a slug history, when deleted, then its `promotion_product` and `product_slug_history` rows are removed and the old URLs return 404.
- [x] AC4 (FR-061): Given a product in a customer's basket, when it is deleted, then the basket line shows `PRODUCT_UNAVAILABLE`.
- [x] AC5 (FR-061): Given an unknown id, then `NOT_FOUND` and nothing changes; given a customer or anonymous caller, then redirect or refusal.
- [x] AC6 (FR-061): Given the product's photo files, then they are removed from Storage or, if removal fails, queued for the orphan purge; the delete itself still succeeds.
- [x] AC7 (NFR-002): Given the dialog at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then focus is trapped and returns, Esc closes, every control has a visible focus indicator and tap targets are at least 44 x 44 px; the destructive button is not colour-only; light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/delete-product.server.test.ts (PGlite with every migration, as the rest of the unit suite; includes the admin order page after the delete)
- AC2 → src/tests/e2e/admin-menu.spec.ts
- AC3 → src/app/server/services/delete-product.server.test.ts
- AC4 → src/app/routes/site/basket.test.ts
- AC5 → src/app/routes/admin/menu.test.ts (NOT_FOUND, anonymous redirect, customer 403)
- AC6 → src/app/server/services/delete-product.server.test.ts, src/app/server/storage.server.test.ts, src/app/jobs/purge-storage.test.ts, src/app/routes/admin/menu.test.ts (Storage down: still deleted, queued)
- AC7 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-041, S-004 (E-01).
- Contract: `admin/menu` `delete { id }`. Data model: `order_item.product_id` is `ON DELETE SET NULL`.

## Build notes (2026-11-12)
- Flow: row sheet → "Delete…" (outline, danger, icon) → dialog "Delete {name}?" with the recommendation and a "Hide instead" button, and "Delete for good" (filled danger, icon + words) as the second explicit press. The row leaves at once and a toast confirms; focus moves to the page's main region (the row was the trigger). A refusal brings the row back with an error toast that stays.
- Photo files: removed from the `public-images` bucket with the service key (server side, 3 s timeout). On failure (or no Storage configured) the paths go to the new `storage_purge` table (migration 0003, expand only) and the hourly `purgeStorage` job retries them. Bundled sample images ("/images/...") are not Storage objects and are skipped.
- AC1 test runs on PGlite with every migration (the suite's database), not a Postgres container: `ON DELETE SET NULL` is exercised for real.
- Contract v0.22.
