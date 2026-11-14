# ADR-0005: A workshop registration is an order

Status: accepted
Date: 2026-11-14 · Deciders: the Owner (flow and fields, 2026-11-14); technical-director, lead-backend, lead-frontend, security-lead

## Context
The bakery runs occasional workshops (E-15): for Valentine's, 10 cakes are prepared and 10
couples come to decorate their own. A registration is one or more cakes (each shared by up to 2
people) at a set price, for one event with a date, times and a limited number of cakes. The
Owner wants the same flow as website orders: the client accepts or refuses, the customer pays
by MCB Juice, an admin taps "Payment received"; unpaid, a reminder at 12 h and the place freed
at 24 h after acceptance. Registrations must also show in Orders and Today, count in Sales,
and get a refund step when a paid registration is cancelled.

Everything after "accepted" already exists for orders: the Juice payment state
(`awaiting_payment`, `awaiting_payment_since`), Payment received and its Undo, the hourly
`paymentDeadlines` job, refusal and refund, the tracking page, the outbox emails, the admin
lists, Today, the activity log and Sales.

## Options
1. **A registration is an `orders` row** with a new source `workshop`, its cakes as
   `order_item` lines (one per cake choice), plus a 1:1 `workshop_registration` row (event,
   number of cakes, people's names, allergies). The event itself is a new `workshop_event`.
2. **A separate `workshop_registration` table with its own status, payment and refund columns.**
   Clean separation, but a second payment model: reminder and release job, Payment received,
   refunds, tracking, admin lists and Sales would all need a parallel version.

## Decision
Option 1. A workshop registration is an order:
- `order_source` gains `workshop`. The order starts in `pending_approval`; **Accept** is the
  shared `approve` (approve then pay, `server/services/approve-then-pay.server`): it moves it to
  `awaiting_payment` with `awaiting_payment_since = now` and queues `payment_instructions`
  (the Juice payment steps, worded for the workshop).
  From there it is the existing Juice path: Payment received → `approved` (confirmed), the
  12 h reminder and 24 h release count from `awaiting_payment_since`, Refuse and Refunded
  as for any order. This is the same approve-then-pay model the "approvepay" job is moving
  website orders to; no second payment model.
- `fulfilment = pickup` with no address (the place is the event's address, shown from the
  event), `fulfil_on` = the event's date, `time_window` = the event's times (id `workshop`),
  so Calendar, Today, the prep list and the evening reminder see it with no change.
- Places are cakes. A place is held while the order is active (not declined, cancelled or
  closed). The procedure `register_workshop` (migration 0026) locks the event row `FOR UPDATE`
  and counts the places held before inserting, in the same CALL: two registrations to one event
  can never both take the last place.
- Cancelling an event cancels every active registration in one statement (paid ones owe their
  total back: the refund step), and queues `workshop_cancelled` to each registrant.
- Marking an event completed completes its confirmed registrations: Sales counts them like
  completed orders (by source `workshop`).

## Consequences
- Good: tracking, payment, refunds, the 24 h job, admin Orders, Today, Calendar, Sales,
  customer totals, anonymisation and My orders work for registrations with small source-aware
  touches (badge, labels, email wording).
- Good: one never-oversell rule in one place (the procedure), tested under concurrency.
- Cost: code that switches on `source` must know `workshop` (TypeScript lists them); emails
  and the tracking page need workshop wording (event title, address, "up to 2 people per cake").
- Cost: `workshop_registration.allergies` is health data: shown to admins only on the
  registration and the event's printable list, never in admin alert pushes or emails, never
  logged, cleared by the anonymise action (data-model "Data classes & retention").
- An order's `order_item.product_id` is null for workshop lines; Top products in Sales lists
  them by name like other product-less lines.
- Rollback: a later migration can stop accepting registrations (drop the procedure); existing
  registrations remain ordinary orders.
