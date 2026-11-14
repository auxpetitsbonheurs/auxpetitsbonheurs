# S-316: Tell registrants when a workshop's date, time or place changes
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 2 pts
Owner: api-engineer, remix-specialist, copywriter

## Story
As a registrant, I want an email when the bakery moves my workshop or changes where it is, so that I come on the right day, at the right time and place.

## Acceptance Criteria
- [x] AC1 (FR-093, FR-094): Given an event with active registrations (pending approval, awaiting payment or confirmed), when an admin saves a new date, start time, end time or address, then each of them with an email gets `workshop_changed` (EN/FR, the order's language) from the outbox, once per save, listing what changed with its previous value ("New time: 15:00–17:30 (before: 14:00–16:30)") and the other details as they are; refused, cancelled, closed and completed registrations are not told.
- [x] AC2: Given a save that changes none of those four (title, text, price, photo, options), then nobody is emailed.
- [x] AC3: Given the change, then each active registration logs "Workshop date, time or place changed by …" in its order activity, and the save says how many were told ("Saved. 2 registrants were emailed about the change.").
- [x] AC4 (UX): Given an event changed after registrations came in, then the event screen shows, per registrant told, "Tell {name} about the change on WhatsApp" (44 px, new tab) with a message in their language giving the new date, time and address, as Cancel workshop does.

## Tests
- AC1, AC2, AC3 → src/app/server/services/workshops.server.test.ts ("tidy: a change of date, time or address tells the active registrants")
- AC1 (templates EN/FR) → src/app/server/email/workshop-emails.test.ts ("workshop changed")
- AC3, AC4 → src/app/routes/admin/workshops.test.ts, src/tests/e2e/workshops.spec.ts ("tidy: the Owner moves the start time …"; axe, tap targets, no sideways scroll at 320/375/1280)

## Notes
- Built by the tidy job (2026-11-14). Closes the gap S-307 recorded ("date or time changes send no automatic email").
- One statement: the event update, the registrations' move, the order log lines and the outbox rows (dedupe `order:<id>:workshop_changed:<event version>`), so a failed save tells nobody and a retried email is sent once.
- The editor's save answer survives the editor's remount (keyed fetcher), so the "Saved" toast now also shows after an edit.
