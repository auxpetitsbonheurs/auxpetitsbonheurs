# S-191: Customer is told about declines, cancellations and order changes
Status: ready
Epic: E-10-notifications
Spec: docs/specs/features/notifications.md#email-catalogue
Estimate: 3 pts
Owner: email-specialist

## Story
As a customer, I want an email when my order is declined, cancelled or changed by the bakery, so that I am never surprised on the day.

## Acceptance Criteria
- [ ] AC1 (FR-070): Given an admin declines an order or a request, then one `order_declined` or `request_declined` email is sent with the reason only if given, and a link to the menu.
- [ ] AC2 (FR-070): Given a cancellation by the customer, by an admin on an Approved order, or by an admin on a `quote_sent` order, then one `cancellation_confirmed` email with the order number is sent.
- [ ] AC3 (FR-070): Given an admin edit changes the date and/or the total of an FR order that has an email, then one `order_updated` email in French (subject "Votre commande a été modifiée") shows the new date and window and/or total, highlighting only what changed, with the tracking link.
- [ ] AC4 (FR-070): Given an EN order, then the subject is "Your order was updated".
- [ ] AC5 (FR-070): Given an edit that changes neither date nor total, or an order with no email, or an admin-created manual order, then no `order_updated` email is sent.
- [ ] AC6 (FR-070, NFR-004): Given a decline with an internal admin note, then the note never appears; only the reason entered for the customer does.
- [ ] AC7 (FR-070): Given the same edit version replayed, then no duplicate `order_updated` (dedupe key with order version).

## Tests
- AC1 → src/app/server/email/templates/declined.test.ts
- AC2 → src/app/server/email/templates/cancellation.test.ts
- AC3 → src/app/server/email/templates/order-updated.test.ts
- AC4 → src/app/server/email/templates/order-updated.test.ts
- AC5 → src/app/server/orders/order-updated-trigger.test.ts
- AC6 → src/app/server/email/templates/declined.test.ts
- AC7 → src/app/server/email/outbox.test.ts

## Notes
- `order_updated` added by owner decision Q11 (README). Edit screen is E-06.
- Dependencies (R9): S-186, S-188, E-06, E-08. Not yet done; expected.
