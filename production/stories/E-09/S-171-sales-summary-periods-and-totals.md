# S-171: Sales summary with periods, revenue, orders and average
Status: ready
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#definitions-single-source-for-numbers
Estimate: 5 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer, accessibility-specialist

## Story
As Sabera or Sarah, I want to see revenue, number of orders and average order for this week, this month, last month or a custom range, so that I know how the bakery is doing.

## Acceptance Criteria
- [ ] AC1 (FR-068): Given 10 completed orders totalling Rs 12,000 in November, when "This month" loads, then Revenue shows Rs 12,000, Orders 10 and Average Rs 1,200; revenue includes delivery fees as stored (owner decision 4) and ignores the paid flag.
- [ ] AC2 (FR-068): Given 3 Approved, 1 Cancelled and 1 Declined orders in range, then none counts in revenue or order count.
- [ ] AC3 (FR-068): Given an average of Rs 1,166.67, then it shows Rs 1,167 (half up, whole rupees).
- [ ] AC4 (FR-068): Given zero orders in range, then tiles show Rs 0 / 0 / Rs 0, the text "No completed orders in this period." shows, and there is no division error.
- [ ] AC5 (FR-068, NFR-008): Given "Last month", then the range is the previous calendar month in Mauritius dates; "This week" runs Monday to Sunday (owner decision 15); default tab is This month; the header shows the range ("1-30 Nov 2026") and `?range=` holds it.
- [ ] AC6 (FR-068): Given Custom with from <= to and at most 366 days (future dates allowed, showing zeros), then it loads; given from > to, over 366 days, or an invalid date, then `VALIDATION_FAILED` shows inline and no data loads.
- [ ] AC7 (FR-068, NFR-008): Given a completed order with `fulfil_on` on 30 Nov at 23:30 Mauritius time, then it falls in November, not December; an order whose `fulfil_on` changed before completion moves range accordingly.
- [ ] AC8 (FR-068): Given a completed order moved back one step, then it no longer counts in revenue after reload.
- [ ] AC9 (FR-068): Given the footnote, then "Revenue counts Completed orders by order date." shows under the tiles.
- [ ] AC10 (FR-068, FR-041, FR-039): Given an Admin session, then Sales loads (owner decision); given the Owner, then it loads; given a customer or anonymous session, then I am redirected to `/admin/login` with no data.
- [ ] AC11 (FR-068, NFR-007): Given FR locale, then labels are French, currency reads "Rs 1,250" and dates are long-form French.
- [ ] AC12 (FR-068, NFR-002): Given keyboard use, then period tabs are `role=tablist` with arrow-key navigation, each tile has a text label (not colour only), date pickers are labelled and keyboard-operable.
- [ ] AC13 (NFR-002, NFR-006): Given 320/375 px and 200% zoom, then there is no horizontal scroll, targets are 44 px, and text meets WCAG AA contrast per `docs/design/tokens.json`.
- [ ] AC14 (FR-068, NFR-001): Given 12k seeded orders, then the loader answers p95 <= 500 ms with no client waterfall and initial JS within the `project.yaml` budget.

## Tests
- AC1 → src/app/domain/sales.test.ts
- AC2 → src/app/domain/sales.test.ts
- AC3 → src/app/domain/sales.test.ts
- AC4 → src/app/routes/admin.sales.test.tsx
- AC5 → src/app/domain/sales.test.ts
- AC6 → src/app/routes/admin.sales.test.tsx
- AC7 → src/app/domain/sales.test.ts
- AC8 → src/app/domain/sales.test.ts
- AC9 → src/app/routes/admin.sales.test.tsx
- AC10 → src/app/routes/admin.sales.test.tsx
- AC11 → src/app/routes/admin.sales.test.tsx
- AC12 → src/tests/e2e/admin-sales.a11y.spec.ts
- AC13 → src/tests/e2e/admin-sales.a11y.spec.ts
- AC14 → src/tests/e2e/admin-sales.perf.spec.ts

## Notes
- FR-068 is Must. Depends on E-02 (roles), E-06 (orders reach Completed), E-07 S-132/S-134 (manual and past-dated orders feed revenue; AC4 of S-134 asserts it counts in sales). Success measure: totals match underlying orders.
- UX: spec "Screens & states" and "Sales summary" (no separate flow doc); admin-order-day.md for admin shell.
- Spec Open Questions 1-4 closed by owner decisions 4, 5, 15, 16.
