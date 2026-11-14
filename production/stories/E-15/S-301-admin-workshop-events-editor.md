# S-301: Admin Workshops: create, edit, publish and unpublish an event
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 5 pts
Owner: remix-specialist, ui-engineer

## Story
As the client, I want to set up a workshop from my phone, so that customers can see it and register.

## Acceptance Criteria
- [x] AC1 (FR-087): Given Owner or Admin, when I open More → Workshops, then I see the events (upcoming first, then past) with date, status and "6 of 10 places held", and a New workshop button.
- [x] AC2 (FR-087): Given the editor, then I enter title and description EN (FR optional, EN fallback), an optional photo (480/960 copies, checked like product photos, scope `workshops`), date, start and end time, address, optional https map link, price, capacity and 1..10 cake options EN/FR; every problem is listed at once with the field named.
- [x] AC3 (FR-087): Given registrations exist, when I lower the capacity below the places held, then the save is refused with "N places are already held"; when I move the date or times, then the active registrations move too.
- [x] AC4 (FR-087): Given two admins editing, then the second save gets EVENT_CHANGED and nothing is overwritten.
- [x] AC5 (FR-087): Given a draft whose date has not passed, when I Publish, then it shows on /workshops at once; Unpublish hides it and keeps its registrations.
- [x] AC6 (NFR-002): Given 320/375 px, keyboard and screen reader, then every field is labelled, targets are 44 px, the save bar stays visible and leaving with unsaved changes asks first.

## Tests
- AC1, AC5 → src/app/routes/admin/workshops.test.ts
- AC2..AC4 → src/app/server/services/workshops.server.test.ts
- AC6 → src/tests/e2e/workshops.spec.ts

## Notes
- Owner and client decisions 2026-11-14 (spec "Decisions").

## Build notes (2026-11-14)
- Built: admin/workshops, admin/workshop (editor, publish, unpublish), upload scope `workshops`. The old single "next event" fields of the Pages editor are no longer shown on /workshops (the events list replaces them); hiding them in the Pages editor is left for a follow-up.
