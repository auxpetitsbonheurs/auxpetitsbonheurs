# S-113: Order detail with Maps, Call and WhatsApp
Status: ready
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#flow
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, api-engineer

## Story
As an admin, I want one screen with everything about an order and one-tap Maps, Call and WhatsApp, so that I can prepare and deliver without hunting.

## Acceptance Criteria
- [ ] AC1 (FR-050): Given an order, when `/admin/orders/:id` loads, then it shows number, status badge, Paid tag, source, placed time; customer name, phone, email; date, window, delivery/pickup; items with options, cake messages and prices; fee and total; customer note; decline or cancel reason if any.
- [ ] AC2 (FR-050): Given a delivery order, when rendered, then "Open in Maps" links to a maps search for the address and Call is a `tel:` link using the E.164 number; the landmark shows.
- [ ] AC3 (FR-050): Given a legacy delivery order with no usable address, or a missing phone, when rendered, then the Maps button is hidden and Call/WhatsApp are disabled with a hint.
- [ ] AC4 (FR-050): Given the WhatsApp button, when pressed, then it opens `wa.me` with the customer's number and the order number prefilled (template picker is E-10 / FR-073).
- [ ] AC5 (FR-050): Given an order total set by hand, when rendered, then the "Total set by hand" tag shows.
- [ ] AC6 (FR-050): Given an unknown order id, when requested, then the `NOT_FOUND` page shows.
- [ ] AC7 (FR-050): Given a signed-in customer or anonymous visitor, when the URL is requested, then redirect to `/admin/login` with no order data; the customer session is not upgraded.
- [ ] AC8 (FR-050): Given a custom-request order, when rendered, then the request fields show (photos are S-114, quote is S-118).
- [ ] AC9 (NFR-002, NFR-006): Given the detail at 320 px and 375 px, 200% zoom and keyboard-only, when used, then Maps, Call and WhatsApp are links with distinct names ("Call Marie", "WhatsApp Marie", "Open Marie's address in Maps"), targets >= 44 px, headings structured, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/order.test.tsx
- AC2 → src/app/routes/admin/order.test.ts
- AC3 → src/app/routes/admin/order.test.tsx
- AC4 → src/app/routes/admin/order.test.ts
- AC5 → src/app/routes/admin/order.test.tsx
- AC6 → src/app/routes/admin/order.test.ts
- AC7 → src/app/routes/admin/order.test.ts
- AC8 → src/app/routes/admin/order.test.tsx
- AC9 → src/tests/e2e/admin-order-detail.spec.ts

## Notes
- E-01 builds a minimal detail with approve; this widens it. Action bar and sheets are S-116.. S-119; layout rules S-126.
- Depends on E-01, E-02.
