# S-174: Customers list with order count and total spent
Status: ready
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#customers
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As an admin, I want a list of customers with how many orders and how much each has spent, so that I recognise my best customers.

## Acceptance Criteria
- [ ] AC1 (FR-065): Given 3 customers, when `/admin/customers` loads, then each row shows name, phone, order count, total spent (Rs) and last order date, sorted by last order by default.
- [ ] AC2 (FR-065): Given a customer with 3 orders (completed Rs 1,000, completed Rs 500, cancelled), then order count is 2 and total spent Rs 1,500 (cancelled excluded from both; owner decision 5).
- [ ] AC3 (FR-065): Given sort options last order, name and total spent, then each orders correctly and the order persists across pages.
- [ ] AC4 (FR-065): Given 45 customers, when I scroll to the end, then page 2 loads through the cursor (30 per page) with no duplicates or gaps.
- [ ] AC5 (FR-065): Given no customers, then "Customers appear after the first order." shows; given a load failure, then an Alert with Retry shows.
- [ ] AC6 (FR-065, NFR-004): Given an anonymised/deleted customer, then the row shows "Deleted customer" with no phone.
- [ ] AC7 (FR-065, FR-041, FR-039): Given Admin or Owner, then the list loads; given a customer or anonymous session, then I am redirected to `/admin/login` with no data.
- [ ] AC8 (FR-065, NFR-007): Given FR locale, then labels are French and money reads "Rs 1,250".
- [ ] AC9 (NFR-002, NFR-006): Given keyboard use, then the list is a table or list with column headers or labelled values, each row link has a unique name (customer name), the sort control is a labelled select, targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and 320/375 px at 200% zoom has no horizontal scroll.
- [ ] AC10 (NFR-001): Given 12k orders seeded, then the list loader answers p95 <= 300 ms.

## Tests
- AC1 → src/app/routes/admin.customers.test.tsx
- AC2 → src/app/domain/customer-totals.test.ts
- AC3 → src/app/routes/admin.customers.test.tsx
- AC4 → src/app/routes/admin.customers.test.tsx
- AC5 → src/app/routes/admin.customers.test.tsx
- AC6 → src/app/routes/admin.customers.test.tsx
- AC7 → src/app/routes/admin.customers.test.tsx
- AC8 → src/app/routes/admin.customers.test.tsx
- AC9 → src/tests/e2e/admin-customers.a11y.spec.ts
- AC10 → src/tests/e2e/admin-customers.perf.spec.ts

## Notes
- Cuttable (cut order #2): FR-065 Customers list. This whole customer group (S-174..S-177) can be deferred without affecting S-171..S-173. Depends on E-06, E-07 (customers created by manual orders, S-133).
- Totals computed on request, never stored.
