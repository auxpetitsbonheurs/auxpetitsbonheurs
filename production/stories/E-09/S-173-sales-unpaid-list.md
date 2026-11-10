# S-173: Unpaid orders list on the sales summary
Status: ready
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#definitions-single-source-for-numbers
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As an admin, I want to see unpaid orders with their amounts for the period, so that I can chase payments.

## Acceptance Criteria
- [ ] AC1 (FR-068): Given an approved unpaid order Rs 3,000 and a completed unpaid order Rs 800 in range, then the list shows both (number, customer name, status, date, total) and the unpaid total Rs 3,800.
- [ ] AC2 (FR-068): Given an order is marked paid, then it leaves the list and the total after reload; revenue is unchanged.
- [ ] AC3 (FR-068): Given statuses pending_approval, quote_needed, quote_sent, declined, cancelled or closed, then they are never listed; in_preparation, ready_for_pickup and out_for_delivery are (owner decision 16, *confirmed* group).
- [ ] AC4 (FR-068): Given more than 200 unpaid rows, then 200 show with "Export CSV for all", and the total still covers all rows.
- [ ] AC5 (FR-068): Given a row, when I tap it, then I open `/admin/orders/:id`.
- [ ] AC6 (FR-068): Given none unpaid, then "Nothing unpaid in this period." shows with Rs 0.
- [ ] AC7 (FR-068, FR-041): Given a customer or anonymous session, then the list is not returned.
- [ ] AC8 (NFR-002, NFR-006): Given keyboard use, then rows are links with unique names (number, customer, amount), the status is text plus badge, targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and 320/375 px at 200% zoom has no horizontal scroll.

## Tests
- AC1 → src/app/domain/sales.test.ts
- AC2 → src/app/domain/sales.test.ts
- AC3 → src/app/domain/sales.test.ts
- AC4 → src/app/domain/sales.test.ts
- AC5 → src/tests/e2e/admin-sales.spec.ts
- AC6 → src/app/routes/admin.sales.test.tsx
- AC7 → src/app/routes/admin.sales.test.tsx
- AC8 → src/tests/e2e/admin-sales.a11y.spec.ts

## Notes
- Depends on S-171, E-06 (paid toggle and order detail). The unpaid scope is by `fulfil_on` in range.
