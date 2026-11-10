# S-043: Hide a product or mark it sold out
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#acceptance-criteria
Estimate: 2 pts
Owner: remix-specialist, api-engineer, ui-engineer

## Story
As a bakery admin, I want to hide an item or mark it sold out in one tap, so that customers cannot order something I cannot make today.

## Acceptance Criteria
- [ ] AC1 (FR-061): Given an available product, when I choose "Mark sold out" in its row sheet, then its status becomes `sold_out`, a toast confirms, and the customer product page shows "Sold out" with no Add button; a forged `addToBasket` returns `PRODUCT_UNAVAILABLE`.
- [ ] AC2 (FR-061): Given a product set to Hidden, when a customer opens its URL, then the response is 404 and it is absent from customer lists.
- [ ] AC3 (FR-061): Given a hidden or sold-out product, when I choose "Show" or "Mark available", then it becomes `available`.
- [ ] AC4 (FR-062): Given a product with no photo, when I set it to `available`, then `VALIDATION_FAILED` "Add a photo first"; setting it to hidden is allowed.
- [ ] AC5 (FR-061): Given an unknown product id or an invalid status, then `NOT_FOUND` or `VALIDATION_FAILED` and nothing changes.
- [ ] AC6 (FR-061): Given a product in a customer's basket that I then hide, when they open the basket, then the line shows `PRODUCT_UNAVAILABLE`.
- [ ] AC7 (FR-041): Given a customer session or anonymous visitor, when `setStatus` is posted, then redirect or refusal and no change.
- [ ] AC8 (NFR-002): Given the row sheet at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable with a visible focus indicator, tap targets are at least 44 x 44 px, the new state is announced in a live region and shown as text, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/site/product.test.ts and src/app/routes/admin/menu.test.ts
- AC2 → src/app/routes/site/product.test.ts
- AC3 → src/app/routes/admin/menu.test.ts
- AC4 → src/app/routes/admin/menu.test.ts
- AC5 → src/app/routes/admin/menu.test.ts
- AC6 → src/app/routes/site/basket.test.ts
- AC7 → src/app/routes/admin/menu.test.ts
- AC8 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-041, S-011 and S-013 (E-01).
- Contract: `admin/menu` `setStatus { id, status }`. A hidden product still in Settings featured list is flagged in S-059.
