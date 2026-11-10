# S-057: Owner blocks days or ranges with a private reason
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#availability-owner
Estimate: 3 pts
Owner: remix-specialist, ui-engineer, api-engineer, postgres-specialist

## Story
As the bakery Owner, I want to block a day or a holiday range and see which orders are already booked then, so that I can take time off without surprises.

## Acceptance Criteria
- [ ] AC1 (FR-066, FR-059): Given a start date, end date and optional reason (up to 200 characters), when I add the block, then it is stored and listed with its dates and reason.
- [ ] AC2 (FR-059): Given a range over dates that have 2 active orders, when I add it, then the response lists those 2 orders as a warning, the block is saved, and the 2 orders keep their status.
- [ ] AC3 (FR-066): Given an end date before the start date, or a missing date, or a reason over 200 characters, then `VALIDATION_FAILED` marks the field and no block is created.
- [ ] AC4 (FR-066): Given a block in the list, when I confirm Remove, then it is deleted; an unknown id gives `NOT_FOUND`.
- [ ] AC5 (FR-066): Given no blocks, then "No blocked dates." shows.
- [ ] AC6 (FR-066): Given a single day, then start equals end and it is valid; given overlapping blocks, then both are kept.
- [ ] AC7 (FR-041): Given an Admin session, when `addBlock` or `removeBlock` is posted, then `FORBIDDEN`; given an anonymous or customer session, then a redirect or refusal.
- [ ] AC8 (NFR-002): Given the block form and list at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [ ] AC9 (NFR-002): Given the fields and the list, then every field has a visible label and a text format hint, remove buttons are named ("Remove block 24 Dec to 2 Jan"), the remove dialog traps focus, results are announced in a live region, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/blocked-dates.server.test.ts
- AC2 → src/app/server/services/blocked-dates.server.test.ts (Postgres container)
- AC3 → src/app/server/services/blocked-dates.server.test.ts
- AC4 → src/app/server/services/blocked-dates.server.test.ts
- AC5 → src/tests/e2e/admin-availability.spec.ts
- AC6 → src/app/server/services/blocked-dates.server.test.ts
- AC7 → src/app/routes/admin/owner-only.test.ts
- AC8 → src/tests/e2e/admin-availability.spec.ts
- AC9 → src/tests/e2e/admin-availability.spec.ts

## Notes
- Depends on: S-056, S-017 (E-01, orders for the warning).
- Contract: `admin/availability` `addBlock` / `removeBlock` returning `existingOrders`. Blocking never touches orders (data-model `blocked_date`). The block applying to new orders at once (spec AC34) is enforced by the availability domain in E-05; the calendar day-block UI is E-07.
- "Active orders" uses the single definition in `domain/status.ts` (all statuses except declined, cancelled, closed).
