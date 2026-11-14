# S-303: Workshop page with the registration form
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 5 pts
Owner: remix-specialist, ui-engineer, security-engineer

## Story
As a customer, I want to register for a workshop in a minute from my phone, so that my place is held.

## Acceptance Criteria
- [x] AC1 (FR-089): Given an open event, then its page shows title, photo, date, times, address (and map link), price, places left, description and the form: name, phone, email, number of cakes (1 to the places left, at most 10), the cake for each, people's names (optional), allergies (None / Yes, please describe), message (optional) and the privacy note link.
- [x] AC2 (FR-089): Given no allergies choice, or Yes without a description, then the form is refused with that field named; nothing typed is lost.
- [x] AC3 (FR-089): Given a signed-in customer (E-11), then name, phone and email are prefilled and the registration goes on their account (My orders).
- [x] AC4 (FR-089): Given Turnstile and RL-request (3 per 10 minutes per IP, its own count), then bots and floods are refused with the form kept; a double tap registers once (idempotency key).
- [x] AC5 (FR-090): Given the places ran out meanwhile, then "Only N places left" shows with the form kept; given a full event, then "This workshop is full" and the WhatsApp ask replace the form.
- [x] AC6 (FR-089): Given success, then the confirmation page says the registration is received and the bakery will confirm and send the payment details; the tracking link works.
- [x] AC7 (NFR-002): Given 320/375/1280 px, EN and FR, keyboard only, then the form is usable, errors are summarised and focused, axe is clean.

## Tests
- AC1, AC5 → src/app/routes/site/workshop.test.ts
- AC2..AC5 → src/app/server/services/workshops.server.test.ts
- AC6, AC7 → src/tests/e2e/workshops.spec.ts

## Notes
- Owner and client decisions 2026-11-14 (spec "Decisions").

## Build notes (2026-11-14)
- Built: /workshops/:slug with the `workshopForm` text namespace (not in the browsing bundle). Without JavaScript the cake choices follow the number posted (a refused post re-renders with the right number of selects).
