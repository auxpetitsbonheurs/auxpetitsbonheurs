# S-173: Unpaid orders list on the sales summary
Status: done
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#definitions-single-source-for-numbers
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As an admin, I want to see unpaid orders with their amounts for the period, so that I can chase payments.

## Acceptance Criteria
- [x] AC1 (FR-068): Given an approved unpaid order Rs 3,000 and a completed unpaid order Rs 800 in range, then the list shows both (number, customer name, status, date, total) and the unpaid total Rs 3,800.
- [x] AC2 (FR-068): Given an order is marked paid, then it leaves the list and the total after reload; revenue is unchanged.
- [x] AC3 (FR-068): Given statuses pending_approval, quote_needed, quote_sent, declined, cancelled or closed, then they are never listed; in_preparation, ready_for_pickup and out_for_delivery are (owner decision 16, *confirmed* group).
- [x] AC4 (FR-068): Given more than 200 unpaid rows, then 200 show with "Export CSV for all", and the total still covers all rows.
- [x] AC5 (FR-068): Given a row, when I tap it, then I open `/admin/orders/:id`.
- [x] AC6 (FR-068): Given none unpaid, then "Nothing unpaid in this period." shows with Rs 0.
- [x] AC7 (FR-068, FR-041): Given a customer or anonymous session, then the list is not returned.
- [x] AC8 (NFR-002, NFR-006): Given keyboard use, then rows are links with unique names (number, customer, amount), the status is text plus badge, targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and 320/375 px at 200% zoom has no horizontal scroll.

## Tests
- AC1 → src/app/server/repos/sales.server.test.ts
- AC2 → src/app/server/repos/sales.server.test.ts
- AC3 → src/app/domain/sales.test.ts
- AC4 → src/app/server/repos/sales.server.test.ts
- AC5 → src/tests/e2e/admin-sales.spec.ts
- AC6 → src/app/routes/admin/sales.test.tsx
- AC7 → src/app/routes/admin/sales.test.tsx
- AC8 → src/tests/e2e/admin-sales.spec.ts

## Notes
- Depends on S-171, E-06 (paid toggle and order detail). The unpaid scope is by `fulfil_on` in range.
- **Decision (2026-11-13, with Juice payment on main): reuse, not duplicate.** Juice payment's Orders > Payment tab (S-279) already owns orders *awaiting* their payment (time left, refunds to send, unpaid cancellations). This list keeps a different set, the one this story asks for: *confirmed* orders (approved to completed) still marked unpaid, in the period, to chase. Orders in `awaiting_payment` are never listed here; instead the section shows "N orders are waiting for their Juice payment." with a link to `/admin/orders?tab=payment`. Rows link to the E-06 order detail `/admin/orders/:id` (no order screen built here).
- Rows are ordered by date then number; each row's link is named "APB-0012, Hélène, Rs 3,000"; the status badge uses the admin wording. Past 200 rows, "Export CSV for all" downloads the CSV whose Unpaid section is uncapped.
