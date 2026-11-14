# S-305: Event registrations, printable list and the Workshop badge
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 3 pts
Owner: remix-specialist, ui-engineer

## Story
As the client, I want to see who is coming and print the list, so that I can prepare the cakes and stations.

## Acceptance Criteria
- [x] AC1 (FR-092): Given an event, then its screen lists registrations with number, name, status, cakes and choices, total, people's names and a highlighted allergy badge, plus totals per cake option and places left.
- [x] AC2 (FR-092): Given Print or share list, then a printable page (like the prep list) lists active registrations with cakes, choices, names, phone and allergies highlighted.
- [x] AC3 (FR-092): Given Orders and Today, then workshop registrations show with a "Workshop" badge; the order screen shows the event, people's names and allergies.

## Tests
- AC1, AC2 → src/app/routes/admin/workshops.test.ts
- AC3 → src/app/routes/admin/order.workshop.test.ts

## Notes
- Owner and client decisions 2026-11-14 (spec "Decisions").

## Build notes (2026-11-14)
- Built: registrations panel, totals per cake option, printable list (`/admin/workshops/:id/list`) with Share text holding counts only, Workshop badge in Orders and Today (no Next step there).
