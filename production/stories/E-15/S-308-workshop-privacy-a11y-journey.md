# S-308: Allergies privacy, accessibility and the registration journey
Status: review
Epic: E-15-workshop-events
Spec: docs/specs/features/workshops.md · ADR: docs/architecture/adr/0005-workshop-registrations-are-orders.md
Estimate: 3 pts
Owner: qa-lead, privacy-compliance-specialist

## Story
As the Owner, I want the workshop data handled like the rest of the customer's data, so that health data never leaks.

## Acceptance Criteria
- [x] AC1 (FR-094): Given Anonymise customer (or the retention job), then the registration's allergies and people's names are cleared with the rest.
- [x] AC2 (NFR-004): Given the privacy note, then it mentions that allergies given for a workshop are used only to prepare it.
- [x] AC3 (NFR-002): Given the journey (admin creates and publishes, customer registers, admin accepts and marks paid) in Playwright at 375 px EN and FR, then it passes with axe clean; screenshots workshops-*.png.

## Tests
- AC1 → src/app/server/services/anonymise-customer.server.test.ts
- AC3 → src/tests/e2e/workshops.spec.ts

## Notes
- Owner and client decisions 2026-11-14 (spec "Decisions").

## Build notes (2026-11-14)
- Built: anonymise clears allergies and people's names; privacy note line; e2e tests/e2e/workshops.spec.ts at 320/375/1280 EN and FR with axe.
