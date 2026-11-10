# S-139: Prep list grouped by product and variant
Status: ready
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-calendar-prep.md#behaviour
Estimate: 5 pts
Owner: remix-specialist, postgres-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As the baker, I want a prep list for a day that groups identical items and shows cake messages, so that I know exactly what to make without reading every order.

## Acceptance Criteria
- [ ] AC1 (FR-060): Given 2 identical cakes (same product, size, flavour, no message) across orders, when the prep list loads, then one line shows "x2".
- [ ] AC2 (FR-060): Given two cakes of the same variant with messages "Happy Bday Ana" and "Joyeux anniversaire", then one line x2 shows both messages as quoted lines.
- [ ] AC3 (FR-060): Given a manual order from S-131, then its items appear in that day's prep list merged with identical items from other orders; free-text items group under "Other" with their text.
- [ ] AC4 (FR-060): Given orders in pending_approval, quote_needed, quote_sent, declined, cancelled or closed, then they are not included; approved, in_preparation, ready_for_pickup, out_for_delivery and completed are (owner decision 3, *confirmed* group).
- [ ] AC5 (FR-060): Given groups, then they follow product order in the menu, each variant line joins option labels with " · " in the admin's locale, and the header shows the long date and "N orders, M items".
- [ ] AC6 (FR-060): Given a cake message of 200 characters or with emoji, then it wraps fully and is never truncated; a message on a non-cake item is shown if present.
- [ ] AC7 (FR-060): Given no orders to prepare, then "No orders to prepare on this day." and a link back to the Calendar show; given a load error, then an Alert with Retry shows; given an invalid date, then 400.
- [ ] AC8 (FR-060, NFR-004): Given any prep list, then no customer name, phone or address appears in the page or response.
- [ ] AC9 (FR-060): Given an order cancelled after approval, then it vanishes from the list on next load.
- [ ] AC10 (FR-041, FR-039): Given a customer or anonymous session, then access is refused/redirected to `/admin/login`; Admin and Owner can view; the evening push deep link `/admin/calendar/<date>/prep` opens it after login.
- [ ] AC11 (NFR-002, NFR-006): Given keyboard use and 320/375 px at 200% zoom, then the list uses real headings per product and lists per variant, quantities are text ("2 ×") not colour, targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and there is no horizontal scroll.
- [ ] AC12 (FR-060, NFR-008): Given an order dated by Mauritius calendar day, then the list is for that MU date and shows "Generated <time>".

## Tests
- AC1 → src/app/domain/prep-list.test.ts
- AC2 → src/app/domain/prep-list.test.ts
- AC3 → src/tests/e2e/admin-manual-order.spec.ts
- AC4 → src/app/domain/prep-list.test.ts
- AC5 → src/app/domain/prep-list.test.ts
- AC6 → src/app/routes/admin.calendar.$date.prep.test.tsx
- AC7 → src/app/routes/admin.calendar.$date.prep.test.tsx
- AC8 → src/app/routes/admin.calendar.$date.prep.test.tsx
- AC9 → src/app/domain/prep-list.test.ts
- AC10 → src/app/routes/admin.calendar.$date.prep.test.tsx
- AC11 → src/tests/e2e/admin-calendar.a11y.spec.ts
- AC12 → src/app/domain/prep-list.test.ts

## Notes
- Depends on E-05/E-06 (orders, statuses), S-131 (manual orders). Statuses follow README decision 5 (confirmed group) and owner decision 3; the calendar counts the active group, so counts and prep list can differ by design.
- Spec Open Question 1 (should pending be excluded) is resolved by owner decision 3.
- Share and print are S-140.
