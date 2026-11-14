# Feature Spec — Manual MCB Juice payment, paid in full at order

Status: ready · Owner: product-manager · Updated: 2026-11-14 (Owner decision 2026-11-14: approve, then pay)
Epic: E-05 (stories S-277..S-282) · Contract: `docs/architecture/api/contracts.md` v0.40, approve-then-pay v0.58 · Data: `docs/architecture/data-model.md` (migrations 0013, 0016, 0025)
Supersedes, for website orders: "No online payment … admins mark paid manually; Juice or cash" (checkout-and-tracking Summary), FR-022 payment line, FR-024 initial status.

## Summary
The bakery takes the full amount for every website order by MCB Juice to the client's personal Juice account. There is no gateway and no fee. **Approve, then pay (2026-11-14):** a placed order waits as **Pending approval**; the customer is told the bakery will confirm it, then send the payment details, and sees no Juice details yet. When an admin approves it, it moves to **Awaiting payment**: the customer gets the payment email (name, number, amount, reference, pay-by time, WhatsApp proof button), the tracking page shows the payment guide with copy buttons, and the admin has a one-tap "Send payment details on WhatsApp". In admin one tap ("Payment received", confirmed, undoable) then marks it paid and confirmed. Unpaid orders get a reminder 12 hours after approval and are cancelled 24 hours after approval by the hourly Cron Trigger ("Cancelled: unpaid"), which frees the date. If the client refuses an order after payment, admin shows "Refund Rs X to the customer by Juice" until it is marked Refunded, and the customer sees the order as refused with the refund note.

## Decisions (2026-11-13, revised 2026-11-14)
1. **Status path (website orders, 2026-11-14):** `pending_approval` → (Approve) → `awaiting_payment` → (Payment received) → `approved` (paid). Approve sends `payment_instructions`; Payment received **is** the confirmation and sends `order_confirmed`. Orders already in `awaiting_payment` when this shipped (placed 2026-11-13..14) stay there with their placement clock. An accepted quote (E-08) goes straight to `awaiting_payment`: its acceptance is the approval. Manual orders (E-07) are entered `approved`, unchanged. *(2026-11-13 version: orders were placed `awaiting_payment` with the instructions at once.)*
2. **Refuse** (`decline`) is available from `pending_approval` and `awaiting_payment` (no refund) and from paid `approved` / `in_preparation` (refund due = the order total). The reason is optional, ≤ 500 characters, shown to the customer. The customer may cancel from tracking while pending approval or awaiting payment (unpaid).
3. **Deadline** is computed, never stored: reminder at `awaiting_payment_since + 12 h`, cancel at `awaiting_payment_since + 24 h` (`domain/payment.ts`, `domain/approve-then-pay.ts`); `awaiting_payment_since` is set by Approve (or quote acceptance) and a row without it falls back to `created_at`. The hourly cron means a cancel lands between 24 h and 25 h after approval. A pending order has no clock.
4. **Payment details** (`juice_name`, `juice_number`, `payment_whatsapp`) are Owner-only Settings, validated, never hard-coded, never on a public page or in `/api/menu`, shown only on the confirmation and tracking pages (token pages) of an order awaiting payment, in the `payment_instructions` / `payment_reminder` emails, and in the admin's WhatsApp message. The public checkout says "We confirm your order first, then send you the payment details".
5. **Fallback:** while the Juice name or number is missing, the token pages say "We'll send you the payment details on WhatsApp" (calm, no error) and checkout still works; admin Orders (both tabs) shows a warning: the Owner gets a link to Settings → Payment, Admins see "ask an Owner". While the payment WhatsApp is missing, the instructions show without the WhatsApp button and ask the customer to keep the Juice receipt.
6. **Capacity:** there is no per-date quota; the calendar counts *active* orders, so a cancelled order frees its date at once.
7. **Emails** are queued in `email_outbox` like every order email today (sending is E-10): `order_received` (pending: "we confirm it, then email you how to pay; please do not pay yet", no payment block), `payment_instructions` (on Approve: the payment block with the proof button, deadline 24 h after approval), `payment_reminder`, `order_confirmed` (on Payment received), `order_cancelled_unpaid`, `order_declined`, `order_refunded`. The payment block is `templates.server.ts` `paymentBlock`.
8. **WhatsApp (2026-11-14):** the template `payment_instructions` ("Payment details", EN/FR, editable in Settings) with the placeholders `{juice_name}`, `{juice_number}`, `{total}`, `{order_number}`, `{deadline}`; the admin order screen offers it as one tap ("Send payment details on WhatsApp") while the order awaits payment.

## UX
| Screen | What changes | States |
|---|---|---|
| Checkout summary | Payment line: "Payment: the full amount by MCB Juice. We confirm your order first, then send you the payment details." No number. | — |
| Confirmation `/order/:token/confirmed` | Pending approval (2026-11-14): "Your order is received. We check it and confirm it with you, then send you the payment details. Please do not pay yet.", the total, and "What happens next" (three numbered steps). No Juice details. Once approved (database read): the "Pay now to confirm your order" card first: amount, Juice name, Juice number, reference, each with a Copy button (≥ 44 px), three numbered steps, the deadline ("Please pay by Sat 21 Nov, 12:00. Orders not paid within 24 hours of approval are cancelled."), "Send proof on WhatsApp" (`wa.me/<digits>?text=` prefilled in the order's language). Copy result announced in one polite status. | Details missing: info Alert "We'll send you the payment details on WhatsApp". No JS: copy buttons hidden, values selectable text, WhatsApp is a plain link. |
| Tracking `/t/:token` | Pending approval: info Alert "Waiting for our approval … please do not pay before that". Awaiting payment: the payment guide (the same card). Paid: "Paid" chip + "Payment received, thank you." Refused: Alert with reason and "We are refunding Rs X to you by Juice" / "Refunded Rs X by Juice on <date>". Cancelled: unpaid: Alert "Cancelled: we did not receive the payment within 24 hours" + WhatsApp. | Progress list (website): Pending approval, Awaiting payment, Approved, In preparation, Ready / Out for delivery, Completed. Cancel offered while pending or awaiting payment. |
| Admin Orders `?tab=payment` | Tabs "To review" (pending approval, quote needed) / "Payment". Payment tab: awaiting payment, nearest deadline first (counted from approval), each card with a time-left badge ("12 h left", "45 min left", "Cancelling soon" when overdue), then "Refunds to send", then "Cancelled: unpaid" (last 7 days). Warning Alert when payment details are missing. Today tiles: To review, Quotes to send, Awaiting payment, Unpaid (unchanged). | Empty: "No orders waiting for payment." |
| Admin order | **Approve** (pending): result "Order APB-0042 approved. The customer gets the payment details by email."; status becomes Awaiting payment. Payment section: pending → "Not paid yet. Approving sends the customer the Juice payment details; they then have 24 hours to pay."; awaiting → status, deadline, reference and **Send payment details on WhatsApp** (one tap, the `payment_instructions` template in the order's language). Sticky bar: **Payment received** → confirm step "Rs 1,250 received by Juice for APB-0042?" (**Yes, payment received** / Back) → result "Order APB-0042 marked paid." with **Undo** (while still Approved and nothing later happened). **Refuse order** → reason field + confirm (wording says a refund will be due when paid). Refused and paid: "Refund Rs X to the customer by Juice" with **Refunded** → confirm. | Conflicts reuse the ORDER_CHANGED alert with Reload. |
| Admin Settings (Owner) | Payment section: Juice account name (≤ 60), Juice number (phone, ≤ 20), WhatsApp for payment proof (phone, ≤ 20), with "Shown only to customers who have placed an order". | Field errors as today. |

Every screen is checked at 320 and 375 px, EN and FR, keyboard only, axe clean; tap targets ≥ 44 px; feedback within 100 ms (pending button state) and calm errors.

## Data (migration 0013, forward-only)
- `order_status` gains `awaiting_payment` (before `pending_approval`).
- `orders`: `payment_reminder_sent_at timestamptz`, `cancel_reason text` (`unpaid`), `refund_due_rs integer` (CHECK ≥ 0), `refunded_at timestamptz`, `refunded_by uuid → admin` (CHECK refunded ⇒ refund due).
- `settings`: `juice_name text`, `payment_whatsapp text`.
- `place_order` inserts website orders as `awaiting_payment` and returns `juiceName`, `juiceNumber`, `paymentWhatsapp` in its settings snapshot (promotions logic from 0012 kept unchanged).
- **0025 (2026-11-14, forward-only):** `place_order` re-created from the 0021 body (account, promotions, options, availability unchanged); website orders are inserted as `pending_approval` (status and `created` event), `awaiting_payment_since` null. No data change: orders already in `awaiting_payment` stay as they are. `place_order_limited` (0019) wraps it unchanged. The clock column `orders.awaiting_payment_since` (0016) is set by Approve.

## Contract (v0.40; v0.58 approve, then pay)
- v0.58: `site/order-confirmed` adds `awaitingApproval: boolean` and `totalRs: number | null` (set while pending approval); `payment` is null until approved. `admin/order` `approve` answers `order.status = "awaiting_payment"`; the `whatsapp.templates` list gains `payment_instructions`; `admin/settings` `whatsappTemplates` gains `payment_instructions` and the placeholders `{juice_name}`, `{deadline}`. New outbox template `payment_instructions`.
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
- Approved within 10 minutes of placing: the confirmation page opened from the signed cookie still says "received, waiting for approval"; the tracking page (always a database read) and the email carry the payment details.
- Customer pays before approval: the copy asks not to; the admin can still approve and tap Payment received at once.
- Approve tapped twice / on two phones: versioned update, one `payment_instructions` email (dedupe key per version).

## Reuse (approve, then pay)
Other bookings that the bakery approves before payment (workshop registrations) reuse `domain/approve-then-pay.ts` (`paymentStage`, `paymentTimers`, `paymentDueAt`) and `server/services/approve-then-pay.server.ts` (`approveOrder`, `markPaid`, `undoPaid`, `declineOrder`, `markRefunded`, `paymentDeadlines`), the `paymentBlock` email block, `PaymentInstructions` (customer guide) and the WhatsApp template system.
