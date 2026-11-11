# S-043: Hide a product or mark it sold out
Status: review
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#acceptance-criteria
Estimate: 2 pts
Owner: remix-specialist, api-engineer, ui-engineer

## Story
As a bakery admin, I want to hide an item or mark it sold out in one tap, so that customers cannot order something I cannot make today.

## Acceptance Criteria
- [x] AC1 (FR-061): Given an available product, when I choose "Mark sold out" in its row sheet, then its status becomes `sold_out`, a toast confirms, and the customer product page shows "Sold out" with no Add button; a forged `addToBasket` returns `PRODUCT_UNAVAILABLE`.
- [x] AC2 (FR-061): Given a product set to Hidden, when a customer opens its URL, then the response is 404 and it is absent from customer lists.
- [x] AC3 (FR-061): Given a hidden or sold-out product, when I choose "Show" or "Mark available", then it becomes `available`.
- [x] AC4 (FR-062): Given a product with no photo, when I set it to `available`, then `VALIDATION_FAILED` "Add a photo first"; setting it to hidden is allowed.
- [x] AC5 (FR-061): Given an unknown product id or an invalid status, then `NOT_FOUND` or `VALIDATION_FAILED` and nothing changes.
- [x] AC6 (FR-061): Given a product in a customer's basket that I then hide, when they open the basket, then the line shows `PRODUCT_UNAVAILABLE`.
- [x] AC7 (FR-041): Given a customer session or anonymous visitor, when `setStatus` is posted, then redirect or refusal and no change.
- [x] AC8 (NFR-002): Given the row sheet at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable with a visible focus indicator, tap targets are at least 44 x 44 px, the new state is announced in a live region and shown as text, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/admin/menu.test.ts (status, customer page, cached menu version) and src/app/routes/site/product.test.ts (forged addToBasket on a sold-out product: PRODUCT_UNAVAILABLE, S-011); src/tests/e2e/admin-menu.spec.ts (toast, no Add button)
- AC2 → src/app/routes/admin/menu.test.ts (hide → product page 404, absent from /api/menu) and src/tests/e2e/admin-menu.spec.ts
- AC3 → src/app/routes/admin/menu.test.ts
- AC4 → src/app/routes/admin/menu.test.ts
- AC5 → src/app/routes/admin/menu.test.ts
- AC6 → src/app/routes/site/basket.test.ts
- AC7 → src/app/routes/admin/menu.test.ts
- AC8 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-041, S-011 and S-013 (E-01).
- Contract: `admin/menu` `setStatus { id, status }`. A hidden product still in Settings featured list is flagged in S-059.

## Build notes (2026-11-12)
- Row sheet buttons by state: Available → Mark sold out, Hide; Sold out → Mark available, Hide; Hidden → Show on the menu. One tap; the sheet closes at once and the row shows the new state (with "Saving…") while the server confirms; a toast names the product and the new state (polite live region). A refusal puts the row back and says why in the row and in a toast that stays until dismissed.
- Cached menu (ADR-0004): no version to bump; `GET /api/menu`'s ETag is a hash of its content, so the change is a new version (test in menu.test.ts) and a basket line turns "No longer available" on the next revalidation (basket.test.ts).
- Contract v0.21.
