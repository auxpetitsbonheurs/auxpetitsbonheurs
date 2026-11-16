# S-320: A discount on one order, on the invoice and in Sales
Status: done
Epic: E-06-order-management (touches E-09 Sales and the S-127 invoice)
Spec: Owner request 2026-11-16 ("Sometimes the bakery gives promos to specific orders…"); decisions below
Contract: docs/architecture/api/contracts.md "Order discounts" (v0.64)
Estimate: 5 pts
Owner: lead-backend, lead-frontend, ux-lead, test-engineer

## Story
As the Owner or an admin, I want to give a discount on a specific order, so that the customer pays the lower amount, sees that a discount was applied (tracking page, payment guide, emails, WhatsApp, invoice), and Sales counts what was really paid.

## Acceptance Criteria
- [x] AC1: Given any admin on an order's page, then "Add a discount" sits in a Discount section right under the items and total (under the quote for a custom request; it is placed below the contact buttons so, on a phone, they never slide under the sticky action bar); anonymous visitors are sent to sign in and customers get 403.
- [x] AC2: Given the dialog, when the admin chooses a fixed amount in Rs or a percentage, then the new total shows before saving; a percentage applies to the items (never the delivery fee) and rounds half up to whole rupees; the stored value is the discount in Rs plus how it was entered.
- [x] AC3: Given an optional reason (≤ 80 characters), then it is saved; the discount must be > 0 and at most the items (so the total stays ≥ the delivery fee ≥ Rs 0); it can be changed or removed. Out of range → a calm field message, nothing saved.
- [x] AC4: Given pending approval, awaiting payment or a quote (unpaid), then the discount can change; once Payment received it is shown read-only (locked), and Undo of Payment received unlocks it; cancelled, declined, closed and approved-or-later orders can't take one.
- [x] AC5: Given two admins, then a discount saved on a stale page is refused (ORDER_CHANGED, "Reload"), so it never races with Approve or Payment received (versioned, one statement, row locked).
- [x] AC6: Given an order awaiting payment, when the discount changes, then the tracking page and payment guide show the new amount at once and a fresh `payment_instructions` email ("The amount to pay … was updated") replaces one still waiting; the WhatsApp payment message uses the new amount.
- [x] AC7: Given a discount, then the tracking page, the payment guide, the emails' items block and every WhatsApp `{total}` show the subtotal, "Discount (reason) −Rs X" and the total to pay (WhatsApp: "Rs 1,000 (after a Rs 200 discount)").
- [x] AC8: Given an edit or a re-quote, then the discount stays: a percentage is recomputed, a fixed amount is capped at the new items, Rs 0 removes it.
- [x] AC9: Given the invoice PDF or print view, then rows stay at full price, then Subtotal, "Discount: reason −Rs X", and the total due / paid after it; the totals add up.
- [x] AC10: Given Sales, then Revenue / Amount earned, the average, profit and the CSV use the discounted total; a "Discounts given" tile and CSV columns `discounts` (Summary) and `discount_rs` (Orders) show the discounts; top products share each order's discount across its lines.
- [x] AC11: Given a change, then Activity shows "Discount added / changed / removed by <name>" with the amount, percent, reason and the new total.
- [x] AC12 (a11y): 320/375/1280 px, axe clean, 44 px targets, 200% zoom, EN and FR.

## Tests
- AC2, AC3, AC4, AC8, AC10 (rules) → src/app/domain/order-discount.test.ts
- AC2-AC6 → src/app/server/services/order-discount.server.test.ts
- AC1, AC3, AC4, AC7 (WhatsApp), AC11 → src/app/routes/admin/order-discount.test.ts
- AC7 (emails) → src/app/server/email/discount-emails.test.ts
- AC8 → src/app/server/services/edit-order.server.test.ts, src/app/server/services/quotes.server.test.ts
- AC9 → src/app/server/services/invoice.server.test.ts, src/app/lib/invoice-pdf.test.ts
- AC10 → src/app/server/repos/sales.server.test.ts, src/app/routes/admin/sales-csv.test.ts
- AC1-AC7, AC12 → tests/e2e/admin-order-discount.spec.ts

## Notes
- Built 2026-11-16. Migration 0030 (nullable `orders.discount_rs`, `discount_percent`, `discount_reason`, check `orders_discount_ck`). Contract v0.64. (S-319 and migration 0029 went to the TikTok job.)
- Decision: `total_rs` keeps meaning "the amount to pay", now after the discount; the subtotal is `total_rs + discount_rs`. So payment, refunds, the 24 h job, Sales and profit needed no second rule, and `place_order` and the other procedures never touch the new columns.
- Decision: the discount applies to the items (subtotal before delivery); the delivery fee is never discounted. A total set by hand (S-122 override) counts as the subtotal.
- Decision: per-product revenue spreads each order's discount over its lines in proportion to their line totals (rounded per line), so product figures are what was charged; "Discounts given" is a separate tile.
- Decision: while awaiting payment, a change re-queues `payment_instructions` (admin-triggered, so the per-recipient cap of public forms never counts it; a still-pending one is withdrawn so only the latest amount goes out). Several quick changes can each send one email; the latest is always right.
- Decision: once paid the discount is locked; to correct it, Undo Payment received first (only possible while Payment received is the latest event).
- Not done: the quote email itself is not re-sent when a discount is added to a sent quote; the tracking page shows the discounted total under the quote at once, and the WhatsApp messages use it.
