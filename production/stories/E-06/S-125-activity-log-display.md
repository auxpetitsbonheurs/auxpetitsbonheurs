# S-125: Activity log on the order
Status: ready
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#data-model-changes
Estimate: 2 pts
Owner: remix-specialist, tailwind-shadcn-specialist

## Story
As an admin, I want to read who did what and when on an order, so that I can resolve questions between team members.

## Acceptance Criteria
- [ ] AC1 (FR-045): Given an order with events, when the detail loads, then the log shows them oldest first with actor name and time in Mauritius time, e.g. "Approved by Sarah, 12 Nov 14:05".
- [ ] AC2 (FR-045): Given the actor admin is later deactivated, when the log renders, then the name still shows.
- [ ] AC3 (FR-045): Given customer and system events (customer cancelled, quote expired, `email_failed`), when rendered, then they show as "Customer" or "System" with readable text.
- [ ] AC4 (FR-045, FR-053): Given an `edited` event, when rendered, then the field diff and old/new totals show in plain words; note changes never appear.
- [ ] AC5 (FR-045): Given event details contain customer text, when rendered, then it is escaped.
- [ ] AC6 (FR-045): Given the log in FR admin locale, when rendered, then event labels and dates are French.
- [ ] AC7 (NFR-002, NFR-006): Given the log at 320 px and 375 px, 200% zoom and keyboard-only, when read, then it is an ordered list with a heading, each entry has its time as `<time datetime>`, meaning is not colour-only, text wraps with no clipping, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/order.test.tsx
- AC2 → src/app/routes/admin/order.test.ts
- AC3 → src/app/routes/admin/order.test.tsx
- AC4 → src/app/routes/admin/order.test.tsx
- AC5 → src/app/routes/admin/order.test.tsx
- AC6 → src/app/routes/admin/order.test.tsx
- AC7 → src/tests/e2e/admin-order-detail.spec.ts

## Notes
- Event data is written by E-01 and the action stories; this story is display only (epic scope). Depends on S-113.
