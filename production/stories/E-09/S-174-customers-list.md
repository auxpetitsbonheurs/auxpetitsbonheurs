# S-174: Customers list with order count and total spent
Status: done
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#customers
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As an admin, I want a list of customers with how many orders and how much each has spent, so that I recognise my best customers.

## Acceptance Criteria
- [x] AC1 (FR-065): Given 3 customers, when `/admin/customers` loads, then each row shows name, phone, order count, total spent (Rs) and last order date, sorted by last order by default.
- [x] AC2 (FR-065): Given a customer with 3 orders (completed Rs 1,000, completed Rs 500, cancelled), then order count is 2 and total spent Rs 1,500 (cancelled excluded from both; owner decision 5).
- [x] AC3 (FR-065): Given sort options last order, name and total spent, then each orders correctly and the order persists across pages.
- [x] AC4 (FR-065): Given 45 customers, when I scroll to the end, then page 2 loads through the cursor (30 per page) with no duplicates or gaps.
- [x] AC5 (FR-065): Given no customers, then "Customers appear after the first order." shows; given a load failure, then an Alert with Retry shows.
- [x] AC6 (FR-065, NFR-004): Given an anonymised/deleted customer, then the row shows "Deleted customer" with no phone.
- [x] AC7 (FR-065, FR-041, FR-039): Given Admin or Owner, then the list loads; given a customer or anonymous session, then I am redirected to `/admin/login` with no data.
- [x] AC8 (FR-065, NFR-007): Given FR locale, then labels are French and money reads "Rs 1,250".
- [x] AC9 (NFR-002, NFR-006): Given keyboard use, then the list is a table or list with column headers or labelled values, each row link has a unique name (customer name), the sort control is a labelled select, targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and 320/375 px at 200% zoom has no horizontal scroll.
- [x] AC10 (NFR-001): Given 12k orders seeded, then the list loader answers p95 <= 300 ms.

## Tests
- AC1 → src/app/routes/admin/customers.test.tsx, src/app/server/repos/admin-customers.server.test.ts
- AC2 → src/app/domain/customer-totals.test.ts
- AC3 → src/app/routes/admin/customers.test.tsx, src/app/server/repos/admin-customers.server.test.ts
- AC4 → src/app/routes/admin/customers.test.tsx, src/app/server/repos/admin-customers.server.test.ts
- AC5 → src/app/routes/admin/customers.test.tsx, src/app/server/repos/admin-customers.server.test.ts
- AC6 → src/app/routes/admin/customers.test.tsx, src/app/server/repos/admin-customers.server.test.ts
- AC7 → src/app/routes/admin/customers.test.tsx, src/app/server/repos/admin-customers.server.test.ts
- AC8 → src/app/routes/admin/customers.test.tsx, src/app/server/repos/admin-customers.server.test.ts
- AC9 → src/tests/e2e/admin-customers.spec.ts
- AC10 → src/tests/e2e/admin-sales.perf.spec.ts

## Notes
- Cuttable (cut order #2): FR-065 Customers list. This whole customer group (S-174..S-177) can be deferred without affecting S-171..S-173. Depends on E-06, E-07 (customers created by manual orders, S-133).
- Totals computed on request, never stored.
- Built 2026-11-14 (E-09 sales job). Totals are aggregated in one SQL query per page from `orders` (rules in `domain/customer-totals`: count leaves out declined, cancelled and closed; total spent = Completed only, like Sales revenue), never stored. Last order = the latest order *placed* (any status), as a Mauritius date. Customers without orders (e.g. a new customer account) are listed with "None".
- AC4: "Show more customers" appends the next 30 in place with JavaScript (no scroll trigger, so keyboard and screen-reader users control it); without JavaScript it is a link to the next page. The cursor is opaque and tied to the sort.
- AC6: there is no anonymised flag column yet; a customer named "Deleted customer" (the retention job's rule in data-model.md) is treated as anonymised. The erasure spec may add a flag: `isAnonymised` in `domain/customer-totals` is the one place to change.
- 2026-11-14 (PRV-02): `customer.anonymised_at` (migration 0022) is now that flag; `isAnonymised` and search read it.
- AC10: measured in src/tests/e2e/admin-sales.perf.spec.ts with 12,000 orders seeded (Worker Server-Timing `app`, 20 requests after warm-up): p95 30 ms locally, budget 300 ms.
