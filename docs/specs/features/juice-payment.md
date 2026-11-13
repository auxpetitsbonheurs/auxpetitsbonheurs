# Feature Spec — Manual MCB Juice payment, paid in full at order

Status: ready · Owner: product-manager · Updated: 2026-11-13 (Owner/client decision 2026-11-13)
Epic: E-05 (stories S-277..S-282) · Contract: `docs/architecture/api/contracts.md` v0.40 · Data: `docs/architecture/data-model.md` (migration 0013)
Supersedes, for website orders: "No online payment … admins mark paid manually; Juice or cash" (checkout-and-tracking Summary), FR-022 payment line, FR-024 initial status.

## Summary
The bakery takes the full amount for every website order, at order time, by MCB Juice to the client's personal Juice account. There is no gateway and no fee. As soon as the order is placed, the customer sees how to pay ("Pay Rs 1,250 by Juice to <name> / <number>, reference APB-0042"), with copy buttons, and sends the payment screenshot by WhatsApp from a prefilled chat. The order waits as **Awaiting payment**; in admin one tap ("Payment received", confirmed, undoable) marks it paid and confirmed. Unpaid orders get a reminder after 12 hours and are cancelled after 24 hours by the hourly Cron Trigger ("Cancelled: unpaid"), which frees the date. If the client refuses an order after payment, admin shows "Refund Rs X to the customer by Juice" until it is marked Refunded, and the customer sees the order as refused with the refund note.

## Decisions (2026-11-13)
1. **Status path (website orders):** `awaiting_payment` → (Payment received) → `approved` (paid). Payment received **is** the confirmation: one tap for the client, and the customer gets the `order_confirmed` email. Orders already in `pending_approval` keep the old Approve path. Recorded as an assumption for the Owner to confirm (the alternative was a second Approve tap after payment).
2. **Refuse** (`decline`) is available from `awaiting_payment` (no refund) and from paid `approved` / `in_preparation` (refund due = the order total). The reason is optional, ≤ 500 characters, shown to the customer.
3. **Deadline** is computed, never stored: reminder at `created_at + 12 h`, cancel at `created_at + 24 h` (`domain/payment.ts`). The hourly cron means a cancel lands between 24 h and 25 h.
4. **Payment details** (`juice_name`, `juice_number`, `payment_whatsapp`) are Owner-only Settings, validated, never hard-coded, never on a public page or in `/api/menu`, shown only on the confirmation and tracking pages (token pages) of an order awaiting payment. The public checkout says "You pay the full amount by Juice right after placing your order".
5. **Fallback:** while the Juice name or number is missing, the token pages say "We'll send you the payment details on WhatsApp" (calm, no error) and checkout still works; admin Orders (both tabs) shows a warning: the Owner gets a link to Settings → Payment, Admins see "ask an Owner". While the payment WhatsApp is missing, the instructions show without the WhatsApp button and ask the customer to keep the Juice receipt.
6. **Capacity:** there is no per-date quota; the calendar counts *active* orders, so a cancelled order frees its date at once.
7. **Emails** are queued in `email_outbox` like every order email today (sending is E-10): `payment_reminder`, `order_confirmed` (on Payment received), `order_cancelled_unpaid`, `order_declined`, `order_refunded`. `order_received` renders the payment block (`templates.server.ts` `paymentBlock`).

## UX
| Screen | What changes | States |
|---|---|---|
| Checkout summary | Payment line: "Payment: the full amount by MCB Juice. You get the payment details as soon as you place your order." No number. | — |
| Confirmation `/order/:token/confirmed` | "Pay now to confirm your order" card first: amount, Juice name, Juice number, reference, each with a Copy button (≥ 44 px), three numbered steps, the deadline ("Please pay by Fri 14 Nov, 15:05; unpaid orders are cancelled after 24 hours"), "Send proof on WhatsApp" (`wa.me/<digits>?text=` prefilled in the order's language). Copy result announced in one polite status. | Details missing: info Alert "We'll send you the payment details on WhatsApp". No JS: copy buttons hidden, values selectable text, WhatsApp is a plain link. |
| Tracking `/t/:token` | Awaiting payment: the same card. Paid: "Paid" chip + "Payment received, thank you." Refused: Alert with reason and "We are refunding Rs X to you by Juice" / "Refunded Rs X by Juice on <date>". Cancelled: unpaid: Alert "Cancelled: we did not receive the payment within 24 hours" + WhatsApp. | Progress list starts with "Awaiting payment" for new orders. |
| Admin Orders `?tab=payment` | Tabs "To review" / "Payment". Payment tab: awaiting payment, oldest deadline first, each card with a time-left badge ("12 h left", "45 min left", "Cancelling soon" when overdue), then "Refunds to send", then "Cancelled: unpaid" (last 7 days). Warning Alert when payment details are missing. | Empty: "No orders waiting for payment." |
| Admin order | Payment section (status, amount, deadline, reference). Sticky bar: **Payment received** → confirm step "Rs 1,250 received by Juice for APB-0042?" (**Yes, payment received** / Back) → result "Order APB-0042 marked paid." with **Undo** (while still Approved and nothing later happened). **Refuse order** → reason field + confirm (wording says a refund will be due when paid). Refused and paid: "Refund Rs X to the customer by Juice" with **Refunded** → confirm. | Conflicts reuse the ORDER_CHANGED alert with Reload. |
| Admin Settings (Owner) | Payment section: Juice account name (≤ 60), Juice number (phone, ≤ 20), WhatsApp for payment proof (phone, ≤ 20), with "Shown only to customers who have placed an order". | Field errors as today. |

Every screen is checked at 320 and 375 px, EN and FR, keyboard only, axe clean; tap targets ≥ 44 px; feedback within 100 ms (pending button state) and calm errors.

## Data (migration 0013, forward-only)
- `order_status` gains `awaiting_payment` (before `pending_approval`).
- `orders`: `payment_reminder_sent_at timestamptz`, `cancel_reason text` (`unpaid`), `refund_due_rs integer` (CHECK ≥ 0), `refunded_at timestamptz`, `refunded_by uuid → admin` (CHECK refunded ⇒ refund due).
- `settings`: `juice_name text`, `payment_whatsapp text`.
- `place_order` inserts website orders as `awaiting_payment` and returns `juiceName`, `juiceNumber`, `paymentWhatsapp` in its settings snapshot (promotions logic from 0012 kept unchanged).

## Contract (v0.40)
- `site/order-confirmed` adds `payment: PaymentView | null` (null once the order is no longer awaiting payment); `apb_confirmed` carries the total, deadline and payment details.
- `site/tracking`: `payment` becomes `PaymentView | null` plus `refund: { amountRs, refundedOn } | null`, `cancelReason`, `declineReason`.
- `PaymentView = { totalRs, reference, deadline: Instant, details: { juiceName, juiceNumber } | null, proofUrl: string | null }`.
- `/api/menu` `checkout.payment` removed.
- `admin/orders` `?tab=payment`; `admin/order` intents `markPaid`, `undoPaid`, `decline`, `markRefunded`.
- `admin/settings` adds `juiceName`, `paymentWhatsapp`; `juiceNumber` becomes a phone.
- Job `paymentDeadlines` (every tick).

## Acceptance criteria
See the stories S-277..S-282 (each AC maps to a test).

## Edge cases
- Order total changed by the client later (`total_overridden`): instructions always show the stored `total_rs`.
- Customer pays after the 24 h cancel: the client refunds or re-creates the order manually (out of scope); tracking says cancelled with WhatsApp.
- Payment received tapped twice / on two phones: versioned update, the second gets ORDER_CHANGED or INVALID_TRANSITION.
- Undo after the job or another admin moved the order: INVALID_TRANSITION, nothing changes.
- Cron runs twice in the same hour or overlaps: status-guarded updates and `dedupe_key` make it idempotent.
- Settings changed after placement: token pages read current Settings (the details of the account to pay now).
