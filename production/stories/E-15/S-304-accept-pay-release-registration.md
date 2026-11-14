# S-304: Accept or refuse a registration; pay by Juice; reminder and release
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 3 pts
Owner: api-engineer, remix-specialist

## Story
As the client, I want to accept or refuse each registration and get paid like for orders, so that unpaid places come back.

## Acceptance Criteria
- [x] AC1 (FR-091): Given a pending registration, then the order screen offers Accept (not Approve) and Refuse; Accept moves it to Awaiting payment from now and queues `payment_instructions` (workshop wording) with the Juice steps; the WhatsApp menu offers the payment message.
- [x] AC2 (FR-091): Given an awaiting registration, when an admin taps Payment received, then it is confirmed and the customer gets the confirmation (workshop wording).
- [x] AC3 (FR-091): Given no payment, then a reminder 12 h after acceptance and the release (cancelled: unpaid) 24 h after, by the existing hourly job; its places are free at once.
- [x] AC4 (FR-091): Given a refusal, then the place is freed and the customer told; a paid one owes its refund (existing refund step).

## Tests
- AC1..AC4 → src/app/server/services/workshops.server.test.ts
- AC1 → src/app/routes/admin/order.workshop.test.ts

## Notes
- Owner and client decisions 2026-11-14 (spec "Decisions").

## Build notes (2026-11-14)
- Built on the approve-then-pay services (approvepay job, contract v0.58): Accept is the shared `approve` intent (pending approval -> awaiting payment, `payment_instructions`), labelled Accept for a registration; no second payment path. The admin's "Send payment details on WhatsApp" works for registrations too.
