# S-045: Delete a product safely
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#acceptance-criteria
Estimate: 2 pts
Owner: remix-specialist, postgres-specialist, ui-engineer

## Story
As a bakery admin, I want to delete a product I no longer sell, so that the menu stays tidy, without damaging past orders.

## Acceptance Criteria
- [ ] AC1 (FR-061): Given a product present in past orders, when I confirm Delete, then the product is removed and those orders still show its name, options and prices (order items keep their snapshot, product link set to null).
- [ ] AC2 (FR-061): Given the confirm dialog, then it names the product, recommends "Hide instead" with a button for it, and Delete needs a second explicit press.
- [ ] AC3 (FR-061): Given a product on a live promotion or with a slug history, when deleted, then its `promotion_product` and `product_slug_history` rows are removed and the old URLs return 404.
- [ ] AC4 (FR-061): Given a product in a customer's basket, when it is deleted, then the basket line shows `PRODUCT_UNAVAILABLE`.
- [ ] AC5 (FR-061): Given an unknown id, then `NOT_FOUND` and nothing changes; given a customer or anonymous caller, then redirect or refusal.
- [ ] AC6 (FR-061): Given the product's photo files, then they are removed from Storage or, if removal fails, queued for the orphan purge; the delete itself still succeeds.
- [ ] AC7 (NFR-002): Given the dialog at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then focus is trapped and returns, Esc closes, every control has a visible focus indicator and tap targets are at least 44 x 44 px; the destructive button is not colour-only; light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/delete-product.server.test.ts (Postgres container)
- AC2 → src/tests/e2e/admin-menu.spec.ts
- AC3 → src/app/server/services/delete-product.server.test.ts
- AC4 → src/app/routes/site/basket.test.ts
- AC5 → src/app/routes/admin/menu.test.ts
- AC6 → src/app/server/services/delete-product.server.test.ts
- AC7 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-041, S-004 (E-01).
- Contract: `admin/menu` `delete { id }`. Data model: `order_item.product_id` is `ON DELETE SET NULL`.
