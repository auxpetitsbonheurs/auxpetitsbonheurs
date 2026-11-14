# S-135: Manual order confirmation email only when appropriate
Status: done
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-manual-orders.md#edge-cases
Estimate: 2 pts
Owner: email-specialist, postgres-specialist, test-engineer

## Story
As a customer who phoned in an order and gave my email, I want a confirmation in my language with a tracking link, so that I have a record; and as an admin I do not want emails sent when none was given or when the order is already in the past.

## Acceptance Criteria
- [x] AC1 (FR-057): Given an email entered and a future date, when saved, then one "Order confirmed" `email_outbox` row is queued in the selected language with the tracking link.
- [x] AC2 (FR-057): Given no email entered, when saved, then no `email_outbox` row exists and the order detail shows the tracking link for the admin to share by WhatsApp.
- [x] AC3 (FR-056): Given a past-dated order with an email, when saved, then no customer email is queued.
- [x] AC4 (FR-057): Given a matched customer with locale FR, then the language selector defaults to FR; given no match, then it defaults to the admin's locale; I can override it and the order stores `locale`.
- [x] AC5 (FR-057): Given the matched customer has no email and an email is entered, then the confirmation goes to the entered email (order snapshot) and `customer.email` is unchanged.
- [x] AC6 (FR-057): Given the order is saved and the outbox row is written, then both happen in the same transaction as the order; a rollback leaves neither.
- [x] AC7 (NFR-002, NFR-007): Given the language selector, then it is a labelled native select with EN/FR options, keyboard-operable, 44 px target and AA contrast per `docs/design/tokens.json`, working at 320/375 px and 200% zoom.

## Tests
- AC1 → src/app/routes/admin.orders.new.test.tsx
- AC2 → src/app/routes/admin.orders.new.test.tsx
- AC3 → src/app/routes/admin.orders.new.test.tsx
- AC4 → src/app/routes/admin.orders.new.test.tsx
- AC5 → src/app/routes/admin.orders.new.test.tsx
- AC6 → src/app/routes/admin.orders.new.test.tsx
- AC7 → src/tests/e2e/admin-manual-order.a11y.spec.ts

## Notes
- Depends on S-131, S-133. Email content is E-10; this story only enqueues (outbox stub is fine). Past-date no-email rule: owner decision 2026-11-10.
- Cites FR-057 for "email only if entered"; email delivery itself is FR-070 (E-10).

## As built (2026-11-14, manual job)
- The `order_confirmed` outbox row (E-10 content; it reads paid/unpaid) is written in the create transaction only with an email and a date not in the past.
- AC2: the order screen now shows the customer's tracking link with a Copy button (any order), and the E-10 WhatsApp templates carry it too.
- AC4: the language select defaults to the admin's language and switches to the matched customer's when "Use this customer" is tapped.
