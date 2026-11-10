# S-051: Preview a product as a customer would see it
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#acceptance-criteria
Estimate: 3 pts
Owner: remix-specialist, ui-engineer

## Story
As a bakery admin, I want to see exactly how a product will look to customers before I publish it, so that I can fix mistakes while it is still hidden.

## Acceptance Criteria
- [ ] AC1 (FR-062): Given a saved hidden product, when I press Preview, then `/admin/menu/:id/preview` shows the real customer product page with the saved data, a "Preview, not live" banner and no Add to basket button.
- [ ] AC2 (FR-062): Given an out-of-season or sold-out product, then Preview still renders (the public page would 404 or block ordering).
- [ ] AC3 (FR-062): Given the EN/FR toggle on the preview, then it shows the product in that language with EN fallback.
- [ ] AC4 (FR-062): Given a new, unsaved product, then the Preview button explains "Cannot preview, save first" and opens nothing.
- [ ] AC5 (FR-062, NFR-004): Given the preview page, then the response has `X-Robots-Tag: noindex` and `Cache-Control: no-store`, and an anonymous visitor or customer session is redirected to `/admin/login` with no product data.
- [ ] AC6 (FR-062): Given an unknown id, then `NOT_FOUND`.
- [ ] AC7 (NFR-002): Given the preview at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable with a visible focus indicator, the banner does not cover content, nothing is clipped, tap targets are at least 44 x 44 px, the banner is a landmark-free text region read before the page, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/admin/product-preview.test.ts
- AC2 → src/app/routes/admin/product-preview.test.ts
- AC3 → src/app/routes/admin/product-preview.test.ts
- AC4 → src/tests/e2e/admin-menu.spec.ts
- AC5 → src/app/routes/admin/product-preview.test.ts
- AC6 → src/app/routes/admin/product-preview.test.ts
- AC7 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-046, S-011 (E-01 product view).
- Contract: `admin/product-preview` (same shape as the `site/product` loader for any status). It reuses the customer product view component so the preview cannot drift from the live page.
