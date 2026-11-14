# S-307: Workshop emails EN/FR and admin alerts
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 3 pts
Owner: api-engineer, copywriter

## Story
As a registrant, I want clear emails at each step in my language, so that I know what to do and when.

## Acceptance Criteria
- [x] AC1 (FR-094): Given a registration, then `workshop_received` is queued in the page language; accepted: `payment_instructions` (workshop wording) with the Juice steps and the 24 h deadline; event cancelled: `workshop_cancelled` with the reason and the refund line when paid.
- [x] AC2 (FR-094): Given a workshop order, then the confirmed, reminder, unpaid-release, refused and refunded emails name the event, date, times and address (not pickup).
- [x] AC3 (FR-094): Given a new registration, then admins with email alerts get `admin_alert_new_workshop` and devices with push on get "New workshop registration"; neither ever contains allergies, names of people or the message.

## Tests
- AC1..AC3 → src/app/server/email/workshop-emails.test.ts

## Notes
- Owner and client decisions 2026-11-14 (spec "Decisions").

## Build notes (2026-11-14)
- Built: templates workshop_received, workshop_cancelled; workshop wording in payment_instructions, confirmed, declined, reminder, unpaid release; admin_alert_new_workshop and push `new_workshop`. Date or time changes of an event send no automatic email (WhatsApp links in admin); recorded for E-10. Update 2026-11-14: closed by S-316 (`workshop_changed`).
