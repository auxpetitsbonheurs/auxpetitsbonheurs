# S-131: Add a manual order from menu products
Status: ready
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-manual-orders.md#ux
Estimate: 5 pts
Owner: remix-specialist, tailwind-shadcn-specialist, postgres-specialist, test-engineer

## Story
As an admin taking a phone order, I want to pick menu products and options, enter the customer, date, window and fulfilment, and save, so that the order is recorded as Approved without the customer using the website.

## Acceptance Criteria
- [ ] AC1 (FR-055, FR-051): Given a valid form with one product (required options chosen), a customer name and phone, a date, a window and pickup, when I tap "Save order", then an order exists with status approved, source manual, the next number APB-nnnn from the counter, total = items + fee, and I land on `/admin/orders/:id` with the toast "Order APB-0043 saved".
- [ ] AC2 (FR-055): Given a cake with its required size group missing, when I save, then `VALIDATION_FAILED` shows on that line and no order is created.
- [ ] AC3 (FR-055): Given the client posts a tampered total or line price, when saved, then the server recomputes prices from `domain/pricing.ts` (live promotions applied) and stores the server total.
- [ ] AC4 (FR-055): Given an empty basket, when the form opens, then it shows "Add a product or a custom item to start.", total Rs 0 and Save is disabled.
- [ ] AC5 (FR-055, FR-045, FR-051): Given a saved manual order, then exactly one `order_event` "created" (actor = me, details `{source: manual}`) exists, written in the same transaction as the order, and no pending_approval event exists.
- [ ] AC6 (FR-055): Given Save is double-tapped with one `idempotencyKey`, then exactly one order exists and both requests redirect to it; given a failed request, my entered values are kept and Retry creates no duplicate.
- [ ] AC7 (FR-055): Given 20 lines in the basket, when I add a 21st, then the picker blocks it client-side and a server call with 21 lines returns `VALIDATION_FAILED`.
- [ ] AC8 (FR-055): Given a product hidden or out of season after the picker loaded, when I save, then `PRODUCT_UNAVAILABLE` lists the line, nothing is saved and the form is kept.
- [ ] AC9 (FR-055): Given delivery, when the address is under 5 characters, then `VALIDATION_FAILED` on address; given pickup, then the address field is hidden and not required. Name is required (max 80), phone required, notes max 1000 with inline counters.
- [ ] AC10 (FR-055, FR-058): Given the order saved in AC1, then it counts in the calendar total for its date.
- [ ] AC11 (FR-041, FR-039): Given an Admin or Owner session, when I open `/admin/orders/new`, then it loads; given a customer or anonymous session, then I am redirected to `/admin/login` with no data and `create` is refused.
- [ ] AC12 (FR-055, NFR-007): Given the admin locale FR, then all labels, picker texts and errors are French and prices read "Rs 1,250".
- [ ] AC13 (NFR-002): Given keyboard only, when I use the product and option sheets, then every control is reachable, focus is trapped in the sheet and restored to the opener on close, Escape closes, and all fields have visible labels and hints.
- [ ] AC14 (NFR-002, NFR-006): Given 320 px and 375 px widths and 200% zoom, then there is no horizontal scroll, controls are at least 44 px, text and icons meet WCAG AA contrast per `docs/design/tokens.json`, fields use tel, email and numeric keyboards, and the sticky total hides while the on-screen keyboard is open.
- [ ] AC15 (NFR-002): Given line quantity steppers and remove buttons, then each has a distinct accessible name including the product ("Increase quantity of Vanilla cake", "Remove Vanilla cake"), and errors are linked with `aria-describedby` and summarised in a focused Alert at the top.

## Tests
- AC1 → src/tests/e2e/admin-manual-order.spec.ts
- AC2 → src/app/routes/admin.orders.new.test.tsx
- AC3 → src/app/domain/pricing.test.ts
- AC4 → src/app/routes/admin.orders.new.test.tsx
- AC5 → src/app/routes/admin.orders.new.test.tsx
- AC6 → src/app/routes/admin.orders.new.test.tsx
- AC7 → src/app/routes/admin.orders.new.test.tsx
- AC8 → src/app/routes/admin.orders.new.test.tsx
- AC9 → src/app/routes/admin.orders.new.test.tsx
- AC10 → src/tests/e2e/admin-manual-order.spec.ts
- AC11 → src/app/routes/admin.orders.new.test.tsx
- AC12 → src/app/routes/admin.orders.new.test.tsx
- AC13 → src/tests/e2e/admin-manual-order.a11y.spec.ts
- AC14 → src/tests/e2e/admin-manual-order.a11y.spec.ts
- AC15 → src/tests/e2e/admin-manual-order.a11y.spec.ts

## Notes
- Dependencies (R9, earlier epics, expected): E-01 skeleton, E-02 (`requireAdmin`, roles), E-03 (catalogue, options, settings windows), E-05 (`domain/pricing.ts`, order counter, tracking token), E-06 (order detail route, order events).
- Free-text items, fee editing, paid, customer matching, warnings and email rules are S-132..S-135. Fulfilment select and default fee come from settings here.
- UX: docs/design/ux/admin-order-day.md plus spec UX section "Screens & states". Copy via copywriter (admin.orders.new.*).
- Rationale: the thinnest end-to-end path first (loader, picker, create, redirect); the rest layer on.
- DoR self-check R1-R8 pass; R9 satisfied only once E-02/E-03/E-05/E-06 stories are done.
