# S-018: Order activity log and the end-to-end skeleton journey
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/specs/features/admin-orders.md#acceptance-criteria
Estimate: 3 pts
Owner: api-engineer, ui-engineer, test-engineer

## Story
As the bakery Owner, I want every change to an order listed with who did it and when, so that I can always see what happened.

## Acceptance Criteria
- [ ] AC1 (FR-045): Given an order created by a customer and approved by Sarah on 12 Nov at 14:05 Mauritius time, when I open it, then the log reads "Created by customer" and "Approved by Sarah, 12 Nov 14:05", oldest first.
- [ ] AC2 (FR-045): Given the log in French, then the labels are French and the time is still Mauritius time.
- [ ] AC3 (FR-045, NFR-013): Given the events table, then the application exposes no update or delete for an event, and the database refuses an event with actor type `admin` and no admin id, or one with another actor type and an admin id.
- [ ] AC4 (FR-045): Given an event is written, then it is in the same transaction as the change (rolling back the change leaves no event).
- [ ] AC5 (FR-045): Given an order with only the created event, then the log shows that one line (no empty-state error).
- [ ] AC6 (success measure): Given a clean database, when a guest places an order for delivery on a 375 px phone, then gets APB-0001 and a tracking link; and a double click on Place order still gives one order; when the Owner signs in on a phone and approves it; then the log shows both steps and the customer's tracking page shows Approved.
- [ ] AC7 (NFR-002): Given the log on the order screen at 320 px and 375 px wide and at 200% zoom, then it is a labelled list, nothing is clipped, and an axe scan reports no serious or critical violations.

## Tests
- AC1 → src/app/routes/admin/order.test.ts
- AC2 → src/app/routes/admin/order.test.ts
- AC3 → src/app/db/schema.test.ts and src/app/server/repos/order-events.server.test.ts
- AC4 → src/app/server/services/approve-order.server.test.ts
- AC5 → src/app/routes/admin/order.test.ts
- AC6 → src/tests/e2e/skeleton-order.spec.ts
- AC7 → src/tests/e2e/admin-approve.spec.ts

## Notes
- Depends on: S-014, S-015, S-016, S-017.
- Contract: `OrderEventView` in shared output shapes. Name survives deactivation because the name is read by join on the admin row, which is never deleted (E-02 S-032 re-tests it).
- AC6 is the epic's success measure; it runs on a local build in CI, and once by hand on staging (recorded in the sprint review).
