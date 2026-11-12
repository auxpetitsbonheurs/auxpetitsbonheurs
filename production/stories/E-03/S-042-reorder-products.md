# S-042: Reorder products within a type
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#acceptance-criteria
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, accessibility-specialist, postgres-specialist

## Story
As a bakery admin, I want to put my best sellers first, so that customers see them at the top of the menu.

## Acceptance Criteria
- [x] AC1 (FR-061): Given the Cakes group, when I drag a product up (or press its Move up button) and release, then the order is saved, shows "Saved", and survives a reload.
- [x] AC2 (FR-061): Given the saved order, then the customer menu query (`menuGrid`) returns that type's products in the same order, by `sort_order`.
- [x] AC3 (FR-061, NFR-002): Given keyboard only, when I focus a drag handle named "Reorder Chocolate cake" and use the arrow keys, then the item moves and a polite live region announces "Chocolate cake moved to position 2 of 5"; Move up and Move down buttons also exist as the non-drag alternative.
- [x] AC4 (FR-061): Given the posted `ids` are not exactly the products of that type (a product was added or removed meanwhile), then `VALIDATION_FAILED` with "The menu changed, reload" and no order is changed.
- [x] AC5 (FR-061): Given reordering within Cakes, then other types' order is untouched.
- [x] AC6 (FR-041): Given a customer session or anonymous visitor, when `reorder` is posted, then a redirect or `FORBIDDEN`/`UNAUTHENTICATED` and no change.
- [x] AC7 (FR-061): Given the move first and last positions, then Move up on the first row and Move down on the last row are disabled and explained.
- [x] AC8 (NFR-002): Given touch dragging at 320 px and 375 px wide and at 200% zoom, then the handle and buttons are at least 44 x 44 px, nothing is clipped, no horizontal scrolling occurs, and reduced motion removes the drag animation.
- [x] AC9 (NFR-002): Given the controls, then each name includes the product so no two controls share a name, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/tests/e2e/admin-menu.spec.ts "S-042 … AC1" (arrow keys and pointer drag; "Saved" status; order survives a reload and is in the database) and src/app/server/services/reorder-products.server.test.ts
- AC2 → src/app/server/repos/catalogue.server.test.ts "listMenuProducts order (S-042 AC2)" (the customer menu read, which `GET /api/menu` and E-04's grid use; there is no separate `menuGrid` function)
- AC3 → src/tests/e2e/admin-menu.spec.ts (handle "Reorder <name>" with arrow keys, focus stays on it, "<name> moved to position 2 of 5." in a polite live region; Move up / Move down in the row's sheet)
- AC4 → src/app/server/services/reorder-products.server.test.ts (missing, unknown, repeated, extra, other-type ids) and src/tests/e2e/admin-menu.spec.ts (product added meanwhile: "The menu changed, reload." with Reload)
- AC5 → src/app/server/services/reorder-products.server.test.ts
- AC6 → src/app/routes/admin/menu.test.ts "reorder (S-042)" (customer FORBIDDEN, anonymous redirect, no change); every admin action is also covered by guard.test.ts and route-guards.test.ts
- AC7 → src/tests/e2e/admin-menu.spec.ts (Move up disabled on the first row, Move down on the last, each described "Already first/last in its group.")
- AC8 → src/tests/e2e/admin-menu.spec.ts (44 px handles and buttons, nothing clipped, no sideways scroll at 320/375/1280 and 200%; reduced motion: rows have no transition, and dragging moves rows without animation)
- AC9 → src/tests/e2e/admin-menu.spec.ts (handle names unique per product; axe light and dark with the sheet open)
- Note: tests that change an order run once on the 375 px project, in the Seasonal group, so parallel specs cannot invalidate the posted list.

## Notes
- Depends on: S-041.
- Contract: `admin/menu` `reorder { type, ids }`. Sort order is per type (data-model product `sort_order`).
- The customer menu page itself is E-04; AC2 checks the shared query so E-04 inherits the order.
