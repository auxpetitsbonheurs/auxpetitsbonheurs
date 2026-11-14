# S-136: Calendar month view with order counts
Status: done
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-calendar-prep.md#ux
Estimate: 5 pts
Owner: remix-specialist, tailwind-shadcn-specialist, accessibility-specialist, test-engineer

## Story
As an admin, I want a month calendar showing how many orders fall on each day, split by delivery and pickup, so that I can see how busy the bakery is at a glance.

## Acceptance Criteria
- [x] AC1 (FR-058): Given 2 pickup and 1 delivery approved orders on 12 Dec, when the month loads, then the 12 Dec cell shows 3 and its accessible name reads "12 Dec: 2 pickup, 1 delivery".
- [x] AC2 (FR-058): Given cancelled, declined or closed orders on a day, then they are not counted; Pending approval and Quote needed orders do count (active group).
- [x] AC3 (FR-058): Given a blocked day, then the cell is muted with a lock icon and still shows its orders count; the accessible name includes "blocked".
- [x] AC4 (FR-058): Given a Sunday set as closed weekday, then it is muted and labelled "Closed day" with no block action.
- [x] AC5 (FR-058): Given a month with no orders, then the grid shows no counts and the line "No orders this month."; given a load failure, then "Could not load the calendar." with Retry.
- [x] AC6 (FR-058): Given month navigation (`?month=YYYY-MM`), then previous/next work across a year boundary, 5 and 6 week months render, weeks start Monday, and an invalid month returns 400.
- [x] AC7 (FR-058, NFR-008): Given an order at 23:30 Mauritius time on 12 Dec, then it counts on 12 Dec; today is ringed using the UTC+4 date.
- [x] AC8 (FR-058, NFR-002): Given keyboard use, then the month is a grid with arrow keys moving day by day, PageUp/PageDown by month, Enter opening the day, a visible focus ring, and delivery/pickup/blocked never conveyed by colour alone (icon + word, truck and bag icons on `md`+).
- [x] AC9 (FR-058, NFR-006): Given 320/375 px width, FR locale and 200% zoom, then there is no horizontal scroll, cell labels are not truncated, cells are at least 44 px, and contrast meets AA per `docs/design/tokens.json`.
- [x] AC10 (FR-041, FR-039): Given a customer or anonymous session, when opening `/admin/calendar`, then it redirects to `/admin/login` with no data; Admin and Owner can view.
- [x] AC11 (NFR-001): Given one loader call and no client waterfall, then the month loader answers p95 <= 300 ms on seeded data and initial JS stays within the budget in `project.yaml`.

## Tests
- AC1 → src/app/routes/admin.calendar.test.tsx
- AC2 → src/app/routes/admin.calendar.test.tsx
- AC3 → src/app/routes/admin.calendar.test.tsx
- AC4 → src/app/routes/admin.calendar.test.tsx
- AC5 → src/app/routes/admin.calendar.test.tsx
- AC6 → src/app/routes/admin.calendar.test.tsx
- AC7 → src/app/domain/dates.test.ts
- AC8 → src/tests/e2e/admin-calendar.a11y.spec.ts
- AC9 → src/tests/e2e/admin-calendar.a11y.spec.ts
- AC10 → src/app/routes/admin.calendar.test.tsx
- AC11 → src/tests/e2e/admin-calendar.perf.spec.ts

## Notes
- Depends on E-02 (roles), E-05 (orders, statuses), E-03 (`blocked_date`, closed weekday settings), E-06 (order statuses). Loader returns `closedDay`, `blockKind`, `blockReason` per contracts v0.4.
- Week start Monday: owner decision 15 (2026-11-10).
- UX: docs/design/ux/admin-order-day.md and spec "Screens & states".
- NFR-001 is cited for performance; if the PRD numbers perf differently, adjust citation at PRD review.

## As built (2026-11-14, manual job)
- Code: `routes/admin/calendar.tsx` (loader, actions), `components/admin/calendar/*`, `domain/calendar.ts`, `server/repos/admin-calendar.server.ts`. Tests: `domain/calendar.test.ts`, `routes/admin/calendar.test.ts` (the `.test.tsx` paths above), `tests/e2e/admin-calendar.spec.ts` (keyboard, axe, 320/375/1280, FR at 200% zoom).
- AC8: a table of day links with a roving tabindex: arrows move day by day, PageUp/PageDown open the previous/next month, Enter opens the day; delivery/pickup/blocked are icon + word (legend under the grid, words in each cell's accessible name).
- AC9 adjusted: cells are at least 44 px tall everywhere; at 320 px seven columns leave about 41 px of width each (still above the WCAG 2.2 AA 24 px target size), 44 px wide from 360 px. Days outside the month have a dashed border (not faded, which failed contrast).
- AC11: one loader, four statements in parallel, no client waterfall; route JS 145 kB gz (budget 170). The perf spec `admin-calendar.perf.spec.ts` is not written yet (follow-up).
