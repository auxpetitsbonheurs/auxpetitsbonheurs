# S-278: Orders start as Awaiting payment, with Juice instructions at once
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
