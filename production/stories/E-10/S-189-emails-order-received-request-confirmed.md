# S-189: Customer gets "received" and "confirmed" emails for orders and requests
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#email-catalogue
Estimate: 5 pts
Owner: email-specialist, api-engineer

## Story
As a customer, I want an email as soon as I order or ask for a cake, and another when it is confirmed with how to pay, so that I know what happens next without calling the bakery.

## Acceptance Criteria
- [ ] AC1 (FR-070, FR-071): Given a website order is placed, then exactly one `order_received` email is queued and sent with order number, items with options, date, window, delivery or pickup, total, the wording "not confirmed yet" and the tracking link.
- [ ] AC2 (FR-070): Given a custom request is sent, then exactly one `request_received` email shows occasion, date, servings, photo count, "we will send a quote" and the tracking link.
- [ ] AC3 (FR-070, FR-071): Given an order is approved by an admin, an accepted quote, or a manual order with an email, then one `order_confirmed` email shows the full summary, the payment reminder (Juice number plus total, or cash on delivery/pickup wording), pickup address or delivery details, tracking link and the 48-hour cancellation sentence (free by WhatsApp until 48 h before, no refund after).
- [ ] AC4 (FR-070): Given a manual order created without an email, then no email is sent and no outbox row exists.
- [ ] AC5 (FR-070): Given the Juice number or pickup address is not yet set in Settings (placeholder), then the email still sends using the current Settings value, never an empty line or "undefined".
- [ ] AC6 (FR-070): Given the same order action is replayed, then no duplicate email (dedupe key).
- [ ] AC7 (FR-070): Given a delivery order, then the pickup address block is absent; given a pickup order, then the delivery fee/address block is absent.
- [ ] AC8 (NFR-004): Given any of these emails, then it holds only the recipient's own order data.

## Tests
- AC1 → src/app/server/email/templates/order-received.test.ts
- AC2 → src/app/server/email/templates/request-received.test.ts
- AC3 → src/app/server/email/templates/order-confirmed.test.ts
- AC4 → src/app/server/orders/manual-order-email.test.ts
- AC5 → src/app/server/email/templates/order-confirmed.test.ts
- AC6 → src/app/server/email/outbox.test.ts
- AC7 → src/app/server/email/templates/order-confirmed.test.ts
- AC8 → src/app/server/email/templates/order-received.test.ts

## Notes
- Cancellation policy and Juice-in-email decided by the Owner (PRD section 12, items 3 and 7).
- Wiring into the services is done here for E-05 (place order), E-06 (approve), E-08 (request, accepted quote) and E-07 (manual order) triggers via the outbox API from S-186.
- Dependencies (R9): S-186, S-188, E-05, E-06, E-07, E-08. Not yet done; expected.
