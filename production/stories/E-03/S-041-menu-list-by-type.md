# S-041: Menu list grouped by type
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#menu-list
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, tailwind-shadcn-specialist

## Story
As a bakery admin on my phone, I want to see all products grouped as cakes, cupcake boxes, desserts and seasonal, so that I can find and manage any item quickly.

## Acceptance Criteria
- [ ] AC1 (FR-061): Given products of several types, when I open `/admin/menu`, then they are grouped under Cakes, Cupcake boxes, Desserts and Seasonal, each row showing photo, name, from-price ("Rs 850") and tags Hidden, Sold out, Seasonal or Scheduled seasonal (window not started) as text.
- [ ] AC2 (FR-061): Given a type with no products, then that group shows "No cakes yet." (matching type name) and an "Add product" button.
- [ ] AC3 (FR-061): Given the data takes longer than 300 ms, then row skeletons show; given a load failure, then an Alert with Retry shows.
- [ ] AC4 (FR-041): Given an Admin or an Owner, then the page loads; given an anonymous visitor or a customer session, then a redirect to `/admin/login` and no menu data.
- [ ] AC5 (FR-061): Given a product with no photo, then the row shows a neutral placeholder with empty alt text (decorative) and the name as text.
- [ ] AC6 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC7 (NFR-002): Given the list, then each group has a heading, tags are text (not colour only), each row's actions button has a distinct name ("Actions for Chocolate cake"), and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.
- [ ] AC8 (NFR-007): Given the admin language French, then group names and tags show in French and product names follow the page locale with EN fallback.

## Tests
- AC1 → src/app/routes/admin/menu.test.ts
- AC2 → src/app/routes/admin/menu.test.ts
- AC3 → src/tests/e2e/admin-menu.spec.ts
- AC4 → src/app/routes/admin/menu.test.ts
- AC5 → src/app/routes/admin/menu.test.ts
- AC6 → src/tests/e2e/admin-menu.spec.ts
- AC7 → src/tests/e2e/admin-menu.spec.ts
- AC8 → src/app/routes/admin/menu.test.ts

## Notes
- Depends on: S-009, S-004 (E-01), S-033 (E-02 frame, replaces the Menu placeholder).
- Contract: `admin/menu` loader `{ byType }`. From-price = base price until options exist (S-048); a later story may refine "from" with the lowest choice delta, which the contract's `ProductCard.fromPriceRs` already covers on the customer side (E-04).
