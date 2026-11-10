# S-172: Sales breakdowns: delivery vs pickup, top 5 products, revenue by source
Status: ready
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#sales-summary
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As the Owner, I want to see how sales split between delivery and pickup, which products sell most, and where orders come from, so that I can plan what to make and promote.

## Acceptance Criteria
- [ ] AC1 (FR-068): Given 6 delivery and 4 pickup completed orders, then Delivery shows 6 and Pickup 4 with their revenues, and the two revenues sum to total revenue.
- [ ] AC2 (FR-068): Given 7 products sold, then Top 5 lists the five with most units (sum of `quantity`), ties broken by revenue (sum of `line_total_rs`, excluding delivery fee) then name; fewer than 5 shows fewer rows.
- [ ] AC3 (FR-068): Given free-text manual items, then they affect revenue but are excluded from Top 5 (grouped as "Other items", not eligible).
- [ ] AC4 (FR-068): Given revenue by source, then Website, Custom request and Manual are all listed (zero when none) and their sum equals total revenue; labels are "Site web / Demande sur mesure / Manuelle" in FR.
- [ ] AC5 (FR-068): Given no completed orders in range, then each list shows "No completed orders in this period."
- [ ] AC6 (FR-068, FR-041): Given a customer or anonymous session, then none of these figures are returned.
- [ ] AC7 (NFR-002): Given the lists, then Delivery/Pickup and source are conveyed by icon plus word (never colour alone), lists are real `ul`/`table` markup with headers, and ranks are text ("1.", "2.").
- [ ] AC8 (NFR-002, NFR-006): Given 320/375 px and 200% zoom, then there is no horizontal scroll, targets are 44 px and contrast meets AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/domain/sales.test.ts
- AC2 → src/app/domain/sales.test.ts
- AC3 → src/app/domain/sales.test.ts
- AC4 → src/app/domain/sales.test.ts
- AC5 → src/app/routes/admin.sales.test.tsx
- AC6 → src/app/routes/admin.sales.test.tsx
- AC7 → src/tests/e2e/admin-sales.a11y.spec.ts
- AC8 → src/tests/e2e/admin-sales.a11y.spec.ts

## Notes
- Depends on S-171 (route, range and loader). The loader adds `deliveryRevenueRs`, `pickupRevenueRs` per contracts v0.4.
