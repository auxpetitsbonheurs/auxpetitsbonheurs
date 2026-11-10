# S-176: Customer detail with all their orders
Status: ready
Epic: E-09-customers-sales
Spec: docs/specs/features/admin-sales-customers.md#customers
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, postgres-specialist, test-engineer

## Story
As an admin, I want a customer page with their contact details and every order they placed, so that I can answer questions and call or message them.

## Acceptance Criteria
- [ ] AC1 (FR-065): Given a customer, when I open `/admin/customers/:id`, then I see name, phone with Call and WhatsApp buttons (`telUrl`, `whatsappUrl`), email, language, account yes/no, order count and total spent.
- [ ] AC2 (FR-065): Given the customer has orders, then all are listed newest first including cancelled and declined with status badge; each links to its order, and cancelled/declined are not in the totals.
- [ ] AC3 (FR-065): Given the customer has multiple guest orders with different names, then the header shows the customer record name and each order row its own snapshot name.
- [ ] AC4 (FR-065): Given no orders, then "No orders yet." shows; given an unknown or malformed id, then 404 "Customer not found"; given an anonymised customer, then "Deleted customer" with no phone.
- [ ] AC5 (FR-065): Given a load failure, then an Alert with Retry shows.
- [ ] AC6 (FR-065, FR-041, FR-039): Given Admin or Owner, then it loads; given a customer or anonymous session, then I am redirected to `/admin/login` with no data and no edit or delete of the customer exists in v1.
- [ ] AC7 (NFR-002, NFR-006): Given keyboard use, then Call and WhatsApp are links with distinct names ("Call Anna Rault", "WhatsApp Anna Rault"), orders are a list with unique link names, targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and 320/375 px at 200% zoom has no horizontal scroll.

## Tests
- AC1 → src/app/routes/admin.customers.$id.test.tsx
- AC2 → src/app/routes/admin.customers.$id.test.tsx
- AC3 → src/app/routes/admin.customers.$id.test.tsx
- AC4 → src/app/routes/admin.customers.$id.test.tsx
- AC5 → src/app/routes/admin.customers.$id.test.tsx
- AC6 → src/app/routes/admin.customers.$id.test.tsx
- AC7 → src/tests/e2e/admin-customers.a11y.spec.ts

## Notes
- Cuttable (cut order #2). Depends on S-174, E-06 (order rows, order detail).
- Erasure is an Owner action in a separate spec (out of scope).
