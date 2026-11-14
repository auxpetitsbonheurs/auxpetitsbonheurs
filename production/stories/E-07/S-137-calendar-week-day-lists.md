# S-137: Calendar week and day lists
Status: done
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-calendar-prep.md#behaviour
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As an admin, I want to open a week or a single day and see each order in time order, so that I know when each customer comes or needs a delivery.

## Acceptance Criteria
- [x] AC1 (FR-058): Given week view (`?view=week&date=`), then each day lists its orders sorted by window start then order number, each with a fulfilment icon, status badge and customer name.
- [x] AC2 (FR-058): Given cancelled, declined and closed orders, then they are not listed in week or day views; Quote needed requests list on their requested date with their badge.
- [x] AC3 (FR-058): Given a day with no orders, then week shows "Nothing planned." and day view shows "No orders on this day." with a "Block this day" action.
- [x] AC4 (FR-058): Given I tap an order row, then I open `/admin/orders/:id`.
- [x] AC5 (FR-058): Given a day with 100+ orders, then the day list paginates by day and stays responsive.
- [x] AC6 (FR-058): Given an invalid `date` param, then the loader returns 400; given a load error, then an Alert with Retry shows.
- [x] AC7 (FR-058, NFR-007): Given FR locale, then dates are long-form French, times are Mauritius time, and status badges are translated.
- [x] AC8 (FR-041, FR-039): Given a customer or anonymous session, then access is redirected to `/admin/login`.
- [x] AC9 (NFR-002, NFR-006): Given keyboard use, then view tabs (Month/Week/Day) are a keyboard-operable tablist, rows are links with unique accessible names (number, name, window, fulfilment word, status), targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and layout holds at 320/375 px and 200% zoom without horizontal scroll.

## Tests
- AC1 → src/app/routes/admin.calendar.test.tsx
- AC2 → src/app/routes/admin.calendar.test.tsx
- AC3 → src/app/routes/admin.calendar.test.tsx
- AC4 → src/tests/e2e/admin-calendar.spec.ts
- AC5 → src/app/routes/admin.calendar.test.tsx
- AC6 → src/app/routes/admin.calendar.test.tsx
- AC7 → src/app/routes/admin.calendar.test.tsx
- AC8 → src/app/routes/admin.calendar.test.tsx
- AC9 → src/tests/e2e/admin-calendar.a11y.spec.ts

## Notes
- Depends on S-136 (shared route and loader) and E-06 (Order row component, order detail). Active group per README decision 5.
- Pagination: spec says "lists paginate by day"; interpreted as loading one day at a time (no cursor). Flag for lead-backend if a day exceeds hundreds of rows.

## As built (2026-11-14, manual job)
- AC9 adjusted: Month/Week/Day are links with `aria-current` in a labelled nav (same decision as the Orders tabs, S-111 note: links need no arrow keys, work before JavaScript and keep the back button). Rows reuse E-06's `OrderRow` (one link, ≥ 44 px, named number, name, date, status, paid; window and fulfilment are visible as text and icon + word).
- AC5: the day view lists up to 300 orders of its one day (then a note points to the Orders list with that date); the week view the same cap with a link to the day.
- AC2: Quote needed requests list on their date with their badge (active group).
