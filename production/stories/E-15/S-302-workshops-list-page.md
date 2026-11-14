# S-302: /workshops lists the upcoming events
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, performance-engineer

## Story
As a customer, I want to see the upcoming workshops with their places left, so that I can pick one.

## Acceptance Criteria
- [x] AC1 (FR-088): Given published events whose date has not passed, then /workshops shows them soonest first under the unchanged intro: photo, title, date, times, address, "Rs 1,500 per cake · up to 2 people per cake" and the places left or Full.
- [x] AC2 (FR-088): Given no upcoming event, then the calm "No workshop planned right now" text and the WhatsApp ask show (as before).
- [x] AC3 (FR-088): Given drafts, cancelled, completed or past events, then they never show.
- [x] AC4 (NFR-001): Given the page, then it stays server-rendered with deferred hydration and no added JavaScript; images have explicit sizes and are lazy below the fold; EN and FR at 320/375/1280 px with axe clean.

## Tests
- AC1..AC3 → src/app/routes/site/workshops.test.tsx
- AC4 → src/tests/e2e/workshops.spec.ts

## Notes
- Owner and client decisions 2026-11-14 (spec "Decisions").

## Build notes (2026-11-14)
- Built: /workshops keeps its intro, lists events with EventCard (no client code), deferred hydration unchanged; the page is indexable once a workshop is listed.
