# S-132: Manual order free-text items, delivery fee and paid
Status: done
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-manual-orders.md#ux
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, postgres-specialist, test-engineer

## Story
As an admin, I want to add a custom free-text item with my own price, adjust the delivery fee and mark the order paid, so that special orders and cash payments are recorded exactly as agreed.

## Acceptance Criteria
- [x] AC1 (FR-055): Given a free-text item "Gift box" Rs 400 x 2, when saved, then the order item has `product_id` NULL, `name_en = name_fr = "Gift box"`, no options, and line total Rs 800 included in the total.
- [x] AC2 (FR-055): Given the free-text sheet, when name is empty or over 120 characters, price is outside Rs 0..1,000,000 or quantity outside 1..50, then inline errors show and the line is not added; server `create` also returns `VALIDATION_FAILED`.
- [x] AC3 (FR-055): Given a free-text item at Rs 0 and a total of Rs 0, when saved, then the order saves (gift allowed).
- [x] AC4 (FR-055): Given delivery with settings fee Rs 200 edited to Rs 150, when saved, then `delivery_fee_rs` = 150 and total includes 150; given the fee edited to 0 for delivery, then it saves.
- [x] AC5 (FR-055, FR-056): Given I choose pickup, then the fee field is disabled and shows Rs 0, and switching back to delivery restores the settings fee.
- [x] AC6 (FR-055, FR-056): Given pickup with a posted fee of Rs 150, when saved, then `delivery_fee_rs` = 0 and total = items.
- [x] AC7 (FR-055): Given the fee outside Rs 0..1,000,000 for delivery, then `VALIDATION_FAILED` on the fee.
- [x] AC8 (FR-055, FR-045): Given Paid switched on (default off), when saved, then `paid`, `paid_at` and `paid_by` (current admin) are set and the log shows "Marked paid" in the same transaction as "created".
- [x] AC9 (FR-041): Given an Admin (non-Owner) session, then free-text, fee edit and paid all work; given a customer session, then `create` is refused.
- [x] AC10 (NFR-002, NFR-006): Given the free-text sheet and fee field, then they are keyboard-operable with focus trapped and restored, labelled with hints, 44 px targets, WCAG AA contrast per `docs/design/tokens.json`, no horizontal scroll at 320/375 px and 200% zoom; the Paid switch has an accessible name and state; the disabled fee explains why in text ("Pickup has no delivery fee").

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

## As built (2026-11-14, manual job)
- Payment decision (Juice state model on main): a manual order is saved **Approved** and never enters Awaiting payment, so the 24 h unpaid auto-cancel and the 12 h reminder (which only look at `awaiting_payment`) never touch it, paid or not (tested by running `paymentDeadlines` 3 days later). Paid on: `paid`, `paid_at`, `paid_by` and "Marked paid" with "created". Paid off: the order is Approved and unpaid, shows in Today's Unpaid tile and the Sales unpaid list, and is marked paid later with the order screen's Mark paid flag. A paid manual order that is cancelled owes its refund like any other (Payment tab, Refunded).
- AC5 adjusted: for pickup the shared form hides the fee field and the Total section reads "Pickup: free"; switching back to delivery shows the fee as it was (the Settings fee by default).
