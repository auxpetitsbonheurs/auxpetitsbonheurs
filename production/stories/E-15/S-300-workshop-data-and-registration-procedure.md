# S-300: Workshop events data and the never-oversell registration
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 5 pts
Owner: api-engineer, database-specialist

## Story
As the Owner, I want each workshop's places counted by the database, so that a workshop is never oversold even when two people register at once.

## Acceptance Criteria
- [x] AC1 (FR-090): Given migration 0026, then `workshop_event` and `workshop_registration` exist with checks (status, times, capacity 1..200, 1..10 cake options), RLS on, and `order_source` has `workshop` (ADR-0005).
- [x] AC2 (FR-090): Given a valid registration, when `register_workshop` runs, then one CALL writes a `workshop` order in Pending approval (date and window from the event, pickup, total = cakes × price), one item per cake choice, the registration row, the created event and the outbox rows.
- [x] AC3 (FR-090): Given 1 place left and several registrations at once, then exactly the places left succeed; the others get WORKSHOP_FULL with the places left (event row locked FOR UPDATE).
- [x] AC4 (FR-090): Given a refused, cancelled or unpaid (24 h) registration, then its places are free again.
- [x] AC5 (FR-089): Given a draft, cancelled, completed or past event, then registration is WORKSHOP_CLOSED; a cake not offered is a field error; a known idempotency key replays the original (email must match, G-21).

## Tests
- AC1..AC5 → src/app/server/services/workshops.server.test.ts

## Notes
- Owner and client decisions 2026-11-14 (spec "Decisions").

## Build notes (2026-11-14)
- Built: migration 0026 (enum value, tables, `register_workshop`). Concurrency test runs parallel CALLs; PGlite serialises them, the FOR UPDATE lock is what holds on Postgres.
