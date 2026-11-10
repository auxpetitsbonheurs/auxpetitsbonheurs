# S-132: Manual order free-text items, delivery fee and paid
Status: ready
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-manual-orders.md#ux
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, postgres-specialist, test-engineer

## Story
As an admin, I want to add a custom free-text item with my own price, adjust the delivery fee and mark the order paid, so that special orders and cash payments are recorded exactly as agreed.

## Acceptance Criteria
- [ ] AC1 (FR-055): Given a free-text item "Gift box" Rs 400 x 2, when saved, then the order item has `product_id` NULL, `name_en = name_fr = "Gift box"`, no options, and line total Rs 800 included in the total.
- [ ] AC2 (FR-055): Given the free-text sheet, when name is empty or over 120 characters, price is outside Rs 0..1,000,000 or quantity outside 1..50, then inline errors show and the line is not added; server `create` also returns `VALIDATION_FAILED`.
- [ ] AC3 (FR-055): Given a free-text item at Rs 0 and a total of Rs 0, when saved, then the order saves (gift allowed).
- [ ] AC4 (FR-055): Given delivery with settings fee Rs 200 edited to Rs 150, when saved, then `delivery_fee_rs` = 150 and total includes 150; given the fee edited to 0 for delivery, then it saves.
- [ ] AC5 (FR-055, FR-056): Given I choose pickup, then the fee field is disabled and shows Rs 0, and switching back to delivery restores the settings fee.
- [ ] AC6 (FR-055, FR-056): Given pickup with a posted fee of Rs 150, when saved, then `delivery_fee_rs` = 0 and total = items.
- [ ] AC7 (FR-055): Given the fee outside Rs 0..1,000,000 for delivery, then `VALIDATION_FAILED` on the fee.
- [ ] AC8 (FR-055, FR-045): Given Paid switched on (default off), when saved, then `paid`, `paid_at` and `paid_by` (current admin) are set and the log shows "Marked paid" in the same transaction as "created".
- [ ] AC9 (FR-041): Given an Admin (non-Owner) session, then free-text, fee edit and paid all work; given a customer session, then `create` is refused.
- [ ] AC10 (NFR-002, NFR-006): Given the free-text sheet and fee field, then they are keyboard-operable with focus trapped and restored, labelled with hints, 44 px targets, WCAG AA contrast per `docs/design/tokens.json`, no horizontal scroll at 320/375 px and 200% zoom; the Paid switch has an accessible name and state; the disabled fee explains why in text ("Pickup has no delivery fee").

## Tests
- AC1 → src/app/routes/admin.orders.new.test.tsx
- AC2 → src/app/routes/admin.orders.new.test.tsx
- AC3 → src/app/routes/admin.orders.new.test.tsx
- AC4 → src/app/routes/admin.orders.new.test.tsx
- AC5 → src/app/routes/admin.orders.new.test.tsx
- AC6 → src/app/routes/admin.orders.new.test.tsx
- AC7 → src/app/routes/admin.orders.new.test.tsx
- AC8 → src/app/routes/admin.orders.new.test.tsx
- AC9 → src/app/routes/admin.orders.new.test.tsx
- AC10 → src/tests/e2e/admin-manual-order.a11y.spec.ts

## Notes
- Depends on S-131. Owner decision Q7 (pickup fee forced to Rs 0) applied; free-text names stored once for EN and FR per spec.
- Decision: no manual total override (spec open question answered "no").
- R9: S-131 must be done first.
