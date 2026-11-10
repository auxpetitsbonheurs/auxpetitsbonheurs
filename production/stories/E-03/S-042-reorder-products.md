# S-042: Reorder products within a type
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#acceptance-criteria
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, accessibility-specialist, postgres-specialist

## Story
As a bakery admin, I want to put my best sellers first, so that customers see them at the top of the menu.

## Acceptance Criteria
- [ ] AC1 (FR-061): Given the Cakes group, when I drag a product up (or press its Move up button) and release, then the order is saved, shows "Saved", and survives a reload.
- [ ] AC2 (FR-061): Given the saved order, then the customer menu query (`menuGrid`) returns that type's products in the same order, by `sort_order`.
- [ ] AC3 (FR-061, NFR-002): Given keyboard only, when I focus a drag handle named "Reorder Chocolate cake" and use the arrow keys, then the item moves and a polite live region announces "Chocolate cake moved to position 2 of 5"; Move up and Move down buttons also exist as the non-drag alternative.
- [ ] AC4 (FR-061): Given the posted `ids` are not exactly the products of that type (a product was added or removed meanwhile), then `VALIDATION_FAILED` with "The menu changed, reload" and no order is changed.
- [ ] AC5 (FR-061): Given reordering within Cakes, then other types' order is untouched.
- [ ] AC6 (FR-041): Given a customer session or anonymous visitor, when `reorder` is posted, then a redirect or `FORBIDDEN`/`UNAUTHENTICATED` and no change.
- [ ] AC7 (FR-061): Given the move first and last positions, then Move up on the first row and Move down on the last row are disabled and explained.
- [ ] AC8 (NFR-002): Given touch dragging at 320 px and 375 px wide and at 200% zoom, then the handle and buttons are at least 44 x 44 px, nothing is clipped, no horizontal scrolling occurs, and reduced motion removes the drag animation.
- [ ] AC9 (NFR-002): Given the controls, then each name includes the product so no two controls share a name, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/tests/e2e/admin-menu.spec.ts
- AC2 → src/app/server/repos/catalogue.server.test.ts
- AC3 → src/tests/e2e/admin-menu.spec.ts
- AC4 → src/app/server/services/reorder-products.server.test.ts
- AC5 → src/app/server/services/reorder-products.server.test.ts
- AC6 → src/app/routes/admin/menu.test.ts
- AC7 → src/tests/e2e/admin-menu.spec.ts
- AC8 → src/tests/e2e/admin-menu.spec.ts
- AC9 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-041.
- Contract: `admin/menu` `reorder { type, ids }`. Sort order is per type (data-model product `sort_order`).
- The customer menu page itself is E-04; AC2 checks the shared query so E-04 inherits the order.
