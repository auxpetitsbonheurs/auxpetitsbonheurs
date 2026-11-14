# S-306: Cancel an event (tell everyone, refunds) and mark it completed
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 3 pts
Owner: api-engineer, remix-specialist

## Story
As the client, I want to cancel a workshop and tell everyone at once, or close it after it happened, so that money and Sales stay right.

## Acceptance Criteria
- [x] AC1 (FR-093): Given Cancel workshop (confirm dialog, optional reason), then every active registration is cancelled (event_cancelled), each registrant with an email gets `workshop_cancelled`, and admin shows a WhatsApp link per registrant.
- [x] AC2 (FR-093): Given a paid registration in a cancelled event, then its total is due back and Refunded is offered on the order (existing refund step).
- [x] AC3 (FR-093): Given the event's date has come, when I Mark completed, then confirmed registrations become completed (Sales counts them by source Workshop) and unanswered or unpaid ones are closed without email.
- [x] AC4 (FR-093): Given a stale page, then EVENT_CHANGED; nothing is applied twice.

## Tests
- AC1..AC4 → src/app/server/services/workshops.server.test.ts

## Notes
- Owner and client decisions 2026-11-14 (spec "Decisions").

## Build notes (2026-11-14)
- Built: cancelEvent and completeEvent, one statement each.
