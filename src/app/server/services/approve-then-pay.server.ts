// Approve, then pay (Owner decision 2026-11-14, juice-payment spec): the server steps of the
// flow in one place, so another booking type (workshop registrations) can follow the same
// steps and wording. Each step is ONE versioned statement (row lock, guard, event and outbox
// row in the same statement); "now" is always injected.
//
//   1. placed       → pending_approval   (place_order, migration 0025; email `order_received`)
//   2. approveOrder → awaiting_payment   (starts the 12 h / 24 h clock; email `payment_instructions`)
//   3. markPaid     → approved, paid     (email `order_confirmed`; `undoPaid` right after it)
//   4. unpaid       → cancelled          (job `paymentDeadlines`, 24 h after step 2; frees the date)
//   refuse at 1-3   → declined           (`declineOrder`; a paid order then owes a refund, `markRefunded`)
//
// The pure rules (stages, timers) are `domain/approve-then-pay`; the admin's one-tap WhatsApp
// message is the `payment_instructions` template (`server/whatsapp.server`).
export { approveOrder, type ApproveOrderInput, type ApproveOrderResult } from "./approve-order.server";
export { declineOrder, markPaid, markRefunded, undoPaid, type PaymentActionInput, type PaymentActionResult } from "./order-payment.server";
export { paymentDeadlines } from "~/jobs/payment-deadlines";
