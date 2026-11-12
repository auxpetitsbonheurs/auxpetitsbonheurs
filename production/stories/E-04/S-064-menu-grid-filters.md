# S-064: Menu grid with combining filters
Status: ready
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#menu-rules-fr-005
Estimate: 5 pts
Owner: remix-specialist, tailwind-shadcn-specialist, postgres-specialist

## Story
As a customer, I want to browse the menu and filter by type and allergen, so that I can quickly find a cake that suits my guests.

## Acceptance Criteria
- [ ] AC1 (FR-005): Given available products, when `/menu` loads, then product cards show in `sort_order` with photo, name (locale), "from Rs X" price, badges, in 2 columns at 375 px, 3 at md and 4 at lg.
- [ ] AC2 (FR-005): Given `type=cake&allergen=eggless,nut_free`, when `/menu` loads, then only cakes carrying both tags appear (allergen = AND; across type and allergen = AND).
- [ ] AC3 (FR-005): Given `type=xyz` or an unknown allergen value, when `/menu` loads, then unknown type = All, unknown allergen ignored, and the URL is not rewritten.
- [ ] AC4 (FR-005): Given a sold-out product, when the grid renders, then its card shows the "Sold out" badge and links to its product page; given a hidden product, then it is absent.
- [ ] AC5 (FR-005, FR-006): Given a seasonal product outside its window by `todayMU`, when the grid renders, then it is absent; on the end date D it is present, on D+1 absent (fixed clock); the Seasonal filter lists only products whose window contains today.
- [ ] AC6 (FR-005, FR-016): Given a live promotion on a product, when its card renders, then the original `fromPriceRs` is struck, the sale price shown with a sale/promo badge and a visually hidden "was"; after the promotion ends it shows only the regular price.
- [ ] AC7 (FR-005): Given filters with zero results, when the grid renders, then "No cakes match these filters." names the active filters and "Clear filters" returns to `/menu`.
- [ ] AC8 (FR-005): Given JavaScript is disabled, when a filter chip is pressed, then it works as a link; the back button restores the previous filter (URL-driven).
- [ ] AC9 (FR-005): Given the menu loader errors, when `/menu` is requested, then a section error with Retry shows.
- [ ] AC10 (NFR-002, NFR-006): Given the menu at 320 px and 375 px, at 200% zoom and keyboard-only, when chips and cards are used, then chips are >= 44 px with selection not shown by colour alone (check mark plus `aria-current`/pressed state), every chip has a distinct label, long product names wrap (no ellipsis), contrast is AA per `docs/design/tokens.json`, no sideways scroll.
- [ ] AC11 (NFR-001): Given the menu with 20 products on throttled 4G, when loaded, then LCP <= 2.5 s, CLS <= 0.1, route JS <= 170 kB gz, images lazy below the fold with explicit dimensions and <= 300 kB each.

## Tests
- AC1 → src/app/routes/site/menu.test.tsx
- AC2 → src/app/routes/site/menu.test.ts (loader, in-memory db)
- AC3 → src/app/routes/site/menu.test.ts
- AC4 → src/app/routes/site/menu.test.ts
- AC5 → src/app/routes/site/menu.test.ts (fixed clock)
- AC6 → src/app/routes/site/menu.test.tsx
- AC7 → src/app/routes/site/menu.test.tsx
- AC8 → src/tests/e2e/browse-menu.spec.ts (JS disabled)
- AC9 → src/app/routes/site/menu.test.tsx
- AC10 → src/tests/e2e/browse-menu.spec.ts
- AC11 → src/tests/e2e/perf-budgets.spec.ts

## Notes
- 2026-11-12 (E-13): the `/menu` route and a grouped product list are created by E-13 S-244 ("Our collection"); this story adds the type and allergen filters, promotion pricing and the sold-out and season rules on top of that route. product-director to confirm the split.
- Open question from spec (allergen AND vs OR) decided AND; confirm at launch test.
- `fromPriceRs` and promotion pricing come from the domain (S-081/S-082); this story may use a stub that S-081 replaces. Dependency flagged.
- Depends on E-01, E-03.
