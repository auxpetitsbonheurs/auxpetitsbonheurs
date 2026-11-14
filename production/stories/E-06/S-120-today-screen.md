# S-120: Today screen with counts and today/tomorrow orders
Status: done
Epic: E-06-order-management
Spec: docs/specs/features/admin-orders.md#flow
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, postgres-specialist

## Story
As an admin opening the app in the morning, I want to see what needs review and what is due today and tomorrow, so that I plan my day at a glance.

## Acceptance Criteria
- [ ] AC1 (FR-048): Given seeded orders, when `/admin` loads, then To review = count(pending_approval + quote_needed), Quotes to send = count(quote_needed), Unpaid = count(paid=false and status in approved..completed); each tile links to the matching Orders tab or filter.
- [ ] AC2 (FR-048): Given orders today in windows 12-17 and 9-12, when listed, then 9-12 comes first (sorted by window start, then number); tomorrow's orders appear under Tomorrow.
- [ ] AC3 (FR-048): Given "today" and "tomorrow", when evaluated at 2026-11-09T20:30Z (Mauritius 10 Nov), then they are 10 and 11 Nov (Mauritius time on the server clock; fixed clock).
- [ ] AC4 (FR-048): Given each row, when rendered, then number, name, window, delivery/pickup icon with text, first 2 items plus "+n", and Paid tag show; declined, cancelled and closed orders are not listed (active orders only).
- [ ] AC5 (FR-048): Given no orders today or tomorrow, when rendered, then "No orders today." and "Nothing booked for tomorrow." show and the tiles show 0.
- [ ] AC6 (FR-048): Given the Today counts equal the underlying data, when a status changes, then the next load reflects it (no stale cache; `no-store`).
- [ ] AC7 (FR-048): Given a non-admin, when `/admin` is requested, then redirect to `/admin/login` with no data.
- [ ] AC8 (FR-048): Given the loader fails, when requested, then an error state with Retry shows.
- [ ] AC9 (NFR-002, NFR-006): Given Today at 320 px and 375 px, 200% zoom and keyboard-only, when used, then tiles are links with names ("To review: 3 orders"), rows are descriptive links, status not colour-only, loading skeleton announced, targets >= 44 px, contrast AA per `docs/design/tokens.json`.

## Tests
- AC1 → src/app/routes/admin/today.test.ts
- AC2 → src/app/routes/admin/today.test.ts
- AC3 → src/app/routes/admin/today.test.ts (fixed clock)
- AC4 → src/app/routes/admin/today.test.tsx
- AC5 → src/app/routes/admin/today.test.tsx
- AC6 → src/app/routes/admin/today.test.ts
- AC7 → src/app/routes/admin/today.test.ts
- AC8 → src/app/routes/admin/today.test.tsx
- AC9 → src/tests/e2e/admin-today.spec.ts

## Notes
- Success measure "Today counts equal the underlying data" is tested with an independent count query.
- Depends on E-01, E-02, S-115 (status groups).

## Implementation notes (2026-11-13)
- Adjusted (Juice payment): a fourth tile, Awaiting payment (links to the Payment tab). Quotes to send links to To review (the list has no status filter); Unpaid links to Upcoming with Unpaid (completed unpaid orders are counted and listed under Completed with the same filter).
- The greeting heading stays (S-021 sign-in check). Responses are no-store via the route middleware (AC6). Tests: `app/server/repos/admin-today.server.test.ts` (independent count query), `app/routes/admin/today.test.ts`, `tests/e2e/admin-today.spec.ts`.
- AC9 loading skeleton: Today is server-rendered; no skeleton is shown (the page arrives with its data).
