# S-318: "Cost to make" on orders, "Cost to run" on workshops, and profit in Sales
Status: done
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#costs-and-profit-s-318-owner-decision-2026-11-14
Contract: docs/architecture/api/contracts.md "Costs and profit" (v0.62)
Estimate: 5 pts
Owner: lead-backend, lead-frontend, ux-lead, test-engineer

## Story
As the Owner or an admin, I want to note what each order cost to make and what each workshop cost to run, so that the Sales summary shows what we earned, what we spent and our profit, and tells me calmly when a cost is still missing.

## Acceptance Criteria
- [x] AC1: Given any admin order page, then an optional "Cost to make" field (Rs, whole rupees) shows inline with a clear "Saved" after saving; it never blocks the order's actions.
- [x] AC2: Given the Owner or an Admin, when they enter or edit the cost in any status (also completed, cancelled), then it is saved without changing the order's version.
- [x] AC3: Given a cost outside 0..1,000,000 or not whole rupees, then the server refuses it (`VALIDATION_FAILED`, `fields.costRs`) and the field says so calmly; empty clears it.
- [x] AC4: Given a cost change, then the order's Activity shows "Cost to make changed by <name>" with "Cost: <old> → <new>"; the same value again logs nothing.
- [x] AC5: Given a period, then Sales shows Amount earned (the completed-orders rule; refunds left out), Amount spent (those orders' costs + costs of workshops dated in the period) and Profit (earned − spent).
- [x] AC6: Given counted orders without a cost, then a calm note says how many ("1 order counted here has no cost yet…") with a list linking to each order's cost field.
- [x] AC7: Given a published or completed workshop in the period without a cost, then it counts as Rs 0 and the note says how many workshops have no cost yet; drafts and cancelled events without a cost are left out.
- [x] AC8: Given a workshop event in admin → Workshops, then any admin sets one optional total "Cost to run" in any status.
- [x] AC9: Given the sales CSV, then it carries the cost and profit columns and a Workshops section.
- [x] AC10: Anonymous visitors are sent to sign in and customers get 403; neither can write a cost.
- [x] AC11 (a11y): 320/375/1280 px, axe clean, 44 px targets, 200% zoom, EN and FR.

## Tests
- AC1, AC2, AC3, AC4, AC10 → src/app/routes/admin/order-cost.test.ts, src/app/domain/cost.test.ts, tests/e2e/admin-cost-profit.spec.ts
- AC5, AC6, AC7 → src/app/domain/sales.test.ts (profitSummary), src/app/server/repos/sales.server.test.ts, tests/e2e/admin-cost-profit.spec.ts
- AC8 → src/app/routes/admin/order-cost.test.ts ("Cost to run"), tests/e2e/admin-cost-profit.spec.ts
- AC9 → src/app/routes/admin/sales-csv.test.ts
- AC11 → tests/e2e/admin-cost-profit.spec.ts, tests/e2e/admin-sales.spec.ts

## Notes
- Built 2026-11-14. Migration 0028 (nullable `orders.cost_rs`, `workshop_event.cost_rs`, range checks). Contract v0.62.
- Decision (documented in the spec): a workshop without a cost counts as Rs 0 and is reported when published or completed; a workshop registration order is never reported missing (its event carries the cost), but a cost entered on it still counts.
- "Amount earned" uses the existing Revenue rule (completed orders by order date, paid flag ignored), as the Owner asked ("same rule as the existing sales totals"); completed but unpaid orders still show in the Unpaid list. Open question to the Owner: should earned count only orders marked paid?
- Saves never bump `version` (like the private note), so an open order or event page never gets a conflict because someone typed a cost.
