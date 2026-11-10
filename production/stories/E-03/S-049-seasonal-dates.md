# S-049: Set seasonal dates on a product
Status: ready
Epic: E-03-menu-content-management
Spec: docs/specs/features/admin-menu-content.md#acceptance-criteria
Estimate: 2 pts
Owner: remix-specialist, ui-engineer, api-engineer

## Story
As a bakery admin, I want to give a product start and end dates, so that a Christmas log is only offered in the Christmas window.

## Acceptance Criteria
- [ ] AC1 (FR-062): Given start 1 Dec and end 24 Dec, when I save, then the product stores both dates and the row shows the tag "Seasonal" (or "Scheduled seasonal" before the start).
- [ ] AC2 (FR-062): Given a start after the end, or only one of the two dates, when I save, then `VALIDATION_FAILED` on the dates with a plain message and nothing is saved.
- [ ] AC3 (FR-062): Given both dates cleared, then the product is not seasonal.
- [ ] AC4 (FR-062, FR-006): Given the window 1 to 24 Dec, then the pure function `isInSeason(window, date)` returns true for 24 Dec and false for 25 Dec (inclusive end, Mauritius calendar dates) and true for any date when there is no window.
- [ ] AC5 (FR-062): Given start equal to end (one day), then it is valid.
- [ ] AC6 (NFR-002): Given the two date fields at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable with a visible focus indicator, nothing is clipped, tap targets are at least 44 x 44 px, each field has a visible label and a text format hint, errors are linked, and light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/server/services/save-product.server.test.ts
- AC2 → src/app/server/services/save-product.server.test.ts
- AC3 → src/app/server/services/save-product.server.test.ts
- AC4 → src/app/domain/season.test.ts
- AC5 → src/app/domain/season.test.ts
- AC6 → src/tests/e2e/admin-menu.spec.ts

## Notes
- Depends on: S-046, S-006 (E-01 time helpers).
- Owner decision Q2 (2026-11-10): the window is judged on the pickup or delivery date; the picker, basket and checkout use `isInSeason` in E-04 and E-05. This story only stores the window and provides the predicate.
- The data model CHECK (both null or both set, end >= start) is already in the schema.
