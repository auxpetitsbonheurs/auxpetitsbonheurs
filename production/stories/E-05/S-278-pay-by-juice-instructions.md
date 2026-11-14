# S-278: Orders wait for approval, then show the Juice instructions (approve, then pay, 2026-11-14; was: at once)
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/juice-payment.md
Estimate: 5 pts
Owner: remix-specialist, postgres-specialist, ux-lead

## Story
As a customer who just ordered, I want to see straight away how much to pay, to whom and with which reference, and send my proof on WhatsApp in one tap, so that my order is confirmed quickly.

## Acceptance Criteria
- [ ] AC1: Given a website order is placed, then it is stored as `awaiting_payment` with a customer `created` event to that status (place_order; promotions logic kept).
- [ ] AC2: Given the confirmation page right after placing (signed cookie, no database read) or later (database), then a "Pay now" card shows "Pay Rs <total> by Juice to <name> / <number>, reference <order number>", three numbered steps, the deadline (created + 24 h, Mauritius time) and copy buttons for the number, the amount and the reference, each announced once in a polite status.
- [ ] AC3: Given a payment WhatsApp in Settings, then "Send proof on WhatsApp" opens `https://wa.me/<digits>?text=` with the order number and amount prefilled in the order's language; without it the button is absent and the customer is asked to keep the Juice receipt.
- [ ] AC4: Given the Juice name or number missing, then the card is replaced by a calm info Alert "We'll send you the payment details on WhatsApp" and checkout still places the order.
- [ ] AC5: Given the tracking page of an awaiting-payment order, then the same card shows and the progress list starts with "Awaiting payment".
- [ ] AC6: Given the checkout summary, then the payment line says the full amount is paid by Juice right after placing, and shows no number.
- [ ] AC7: Given 320 and 375 px, EN and FR, keyboard only, then the card has no horizontal scroll, every control is ≥ 44 px and reachable, and axe reports no violation.
- [ ] AC8: Given the `order_received` email is rendered, then it carries the same payment block (or the fallback sentence).

## Tests
- AC1 → src/app/server/services/place-order.server.test.ts
- AC2, AC4 → src/app/routes/site/order-confirmed.test.ts; src/app/domain/payment.test.ts
- AC3 → src/app/domain/payment.test.ts
- AC5 → src/app/routes/site/tracking.test.ts; src/app/domain/status.test.ts
- AC6 → src/app/routes/site/basket.test.ts
- AC7 → src/tests/e2e/juice-payment.spec.ts
- AC8 → src/app/server/email/templates.test.ts

## As built: approve, then pay (Owner decision 2026-11-14)
AC1, AC2, AC5, AC6 and AC8 changed with the decision; AC3, AC4 and AC7 hold for the payment guide, which now appears after the approval.
- AC1 (changed): a website order is stored as `pending_approval` with a customer `created` event to that status (migration 0025 re-creates `place_order` from the 0021 body; only the initial status changes; `awaiting_payment_since` stays null). Orders already in `awaiting_payment` are left as they are.
- AC2 (changed): the confirmation page (cookie or database) says the order is received, shows its total, and lists "What happens next" (we check and approve it; we email how to pay by Juice and the details appear on tracking; you pay within 24 hours and send the proof). No Juice name or number. Once approved, the same page (database) shows the payment card, with the deadline 24 h after the approval.
- AC5 (changed): tracking shows "Waiting for our approval" while pending, then the payment guide (numbered steps, copy buttons, proof button, deadline) once approved; the progress list is Pending approval, Awaiting payment, Approved, In preparation, Ready / Out for delivery, Completed (6 steps; manual orders keep their 5).
- AC6 (changed): the checkout line reads "Payment: the full amount by MCB Juice. We confirm your order first, then send you the payment details."
- AC8 (changed): `order_received` of a pending order has no payment block and says not to pay yet; the new `payment_instructions` email (queued on approval) carries the payment block with the proof button.
- Tests: `place-order.server.test.ts`, `order-confirmed.test.ts`, `tracking.test.ts`, `status.test.ts`, `email/templates/layout.test.ts`, `tests/e2e/juice-payment.spec.ts`, `checkout.spec.ts`, `tracking.spec.ts`, `a11y-audit.spec.ts`.
